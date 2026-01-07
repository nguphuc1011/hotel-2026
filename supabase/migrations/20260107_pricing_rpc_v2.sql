-- ==========================================
-- PRICING BRAIN V2 - SINGLE SOURCE OF TRUTH
-- Migration: 20260107_pricing_rpc_v2.sql
-- Description: Di chuyển logic tính giá từ Frontend (pricing.ts) vào Database
-- ==========================================

-- 0. Helper function: Parse numeric an toàn từ chuỗi (xử lý "100.000đ")
CREATE OR REPLACE FUNCTION public.safe_parse_numeric(p_input text)
RETURNS numeric
LANGUAGE plpgsql
AS $$
BEGIN
    -- Loại bỏ tất cả ký tự không phải số (trừ dấu chấm thập phân nếu có)
    -- Ở VN thường dùng dấu chấm làm phân cách hàng nghìn, nên ta loại bỏ hết
    RETURN COALESCE(NULLIF(regexp_replace(p_input, '[^0-9]', '', 'g'), ''), '0')::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN 0;
END;
$$;

-- 1. Helper function: Tính phụ phí theo phần trăm dựa trên thời gian
CREATE OR REPLACE FUNCTION public.get_applicable_surcharge(
    p_time timestamptz,
    p_rules jsonb,
    p_base_price numeric
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
    v_time_str text;
    v_rule jsonb;
    v_applicable_rule jsonb := NULL;
    v_max_percent numeric := -1;
BEGIN
    IF p_rules IS NULL OR jsonb_array_length(p_rules) = 0 THEN
        RETURN 0;
    END IF;

    -- Chuyển sang múi giờ VN để so sánh chuỗi "HH:MM"
    v_time_str := to_char(p_time AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI');

    -- Tìm rule có phần trăm cao nhất thỏa mãn khung giờ
    FOR v_rule IN SELECT * FROM jsonb_array_elements(p_rules)
    LOOP
        IF v_time_str >= (v_rule->>'from') AND v_time_str <= (v_rule->>'to') THEN
            IF (v_rule->>'percent')::numeric > v_max_percent THEN
                v_max_percent := (v_rule->>'percent')::numeric;
                v_applicable_rule := v_rule;
            END IF;
        END IF;
    END LOOP;

    IF v_applicable_rule IS NOT NULL THEN
        RETURN (p_base_price * (v_applicable_rule->>'percent')::numeric) / 100;
    END IF;

    RETURN 0;
END;
$$;

-- 2. Core function: Tính toán hóa đơn chi tiết (Pricing Brain V2)
CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(
    p_booking_id uuid,
    p_check_out_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_room record;
    v_customer record;
    v_settings jsonb;
    v_rules jsonb;
    v_tax_config jsonb;
    
    v_check_in timestamptz;
    v_check_out timestamptz := p_check_out_at;
    
    v_prices jsonb;
    v_price_hourly numeric;
    v_price_next_hour numeric;
    v_price_overnight numeric;
    v_price_daily numeric;
    
    v_minutes int;
    v_hours int;
    v_days int;
    
    v_base_charge numeric := 0;
    v_surcharge numeric := 0;
    v_early_surcharge numeric := 0;
    v_late_surcharge numeric := 0;
    v_service_total numeric := 0;
    
    v_hourly_grace_mins int;
    v_daily_grace_hours int;
    
    v_rental_type text;
    v_duration_text text;
    
    v_room_tax numeric := 0;
    v_service_tax numeric := 0;
    v_booking_revenue numeric := 0;
    v_customer_balance numeric := 0;
    v_deposit_amount numeric := 0;
    v_final_total_to_pay numeric := 0;
    
    v_summary jsonb;
    v_service_item jsonb;
BEGIN
    -- 1. Lấy dữ liệu Booking & Room & Customer
    SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đơn đặt phòng');
    END IF;

    SELECT r.* INTO v_room FROM public.rooms r WHERE r.id = v_booking.room_id;
    SELECT c.balance INTO v_customer_balance FROM public.customers c WHERE c.id = v_booking.customer_id;
    
    v_customer_balance := COALESCE(v_customer_balance, 0);
    v_deposit_amount := COALESCE(v_booking.deposit_amount, 0);
    
    -- 2. Lấy cấu hình hệ thống
    SELECT value, tax_config INTO v_settings, v_tax_config 
    FROM public.settings 
    WHERE key = 'system_settings';
    
    v_rules := v_settings;
    v_hourly_grace_mins := COALESCE((v_rules->>'hourly_grace_period_minutes')::int, 15);
    v_daily_grace_hours := COALESCE((v_rules->>'daily_grace_period_hours')::int, 2);

    -- 3. Parse giá phòng
    v_prices := v_room.prices;
    v_price_hourly := public.safe_parse_numeric(v_prices->>'hourly');
    v_price_next_hour := public.safe_parse_numeric(v_prices->>'next_hour');
    v_price_overnight := public.safe_parse_numeric(v_prices->>'overnight');
    v_price_daily := public.safe_parse_numeric(v_prices->>'daily');
    
    v_check_in := v_booking.check_in_at;
    v_minutes := EXTRACT(EPOCH FROM (v_check_out - v_check_in))/60;
    v_rental_type := v_booking.rental_type;

    -- 4. Tính toán theo loại hình thuê
    IF v_rental_type = 'hourly' THEN
        DECLARE
            v_extra_mins int := GREATEST(0, v_minutes - 60);
            v_extra_hours int := 0;
        BEGIN
            IF v_extra_mins > v_hourly_grace_mins THEN
                v_extra_hours := CEIL(v_extra_mins::numeric / 60);
            END IF;
            v_base_charge := v_price_hourly + (v_extra_hours * v_price_next_hour);
            v_hours := 1 + v_extra_hours;
            v_duration_text := v_hours || ' giờ';
            
            v_summary := jsonb_build_object(
                'base_price', v_price_hourly,
                'next_hour_price', v_price_next_hour,
                'extra_hours', v_extra_hours,
                'hours', v_hours
            );
        END;

    ELSIF v_rental_type = 'overnight' THEN
        IF v_room.enable_overnight = false THEN
            -- Fallback về hourly nếu phòng không hỗ trợ qua đêm
            v_hours := CEIL(v_minutes::numeric / 60);
            v_base_charge := v_price_hourly + (GREATEST(0, v_hours - 1) * v_price_next_hour);
            v_duration_text := v_hours || ' giờ (Chế độ hourly)';
        ELSE
            v_base_charge := v_price_overnight;
            v_duration_text := 'Qua đêm';
            
            -- Phụ phí sớm/muộn cho qua đêm
            IF COALESCE((v_rules->>'enableAutoSurcharge')::boolean, true) THEN
                v_early_surcharge := public.get_applicable_surcharge(v_check_in, v_rules->'early_rules', v_price_overnight);
                v_late_surcharge := public.get_applicable_surcharge(v_check_out, v_rules->'late_rules', v_price_overnight);
                v_surcharge := v_early_surcharge + v_late_surcharge;
            END IF;
        END IF;
        
        v_summary := jsonb_build_object(
            'base_price', v_price_overnight,
            'early_checkin_surcharge', v_early_surcharge,
            'late_checkout_surcharge', v_late_surcharge
        );

    ELSIF v_rental_type = 'daily' THEN
        DECLARE
            v_nights int := GREATEST(1, EXTRACT(DAY FROM (v_check_out - v_check_in)));
            v_check_in_time text := to_char(v_check_in AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI');
            v_check_out_time text := to_char(v_check_out AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI');
            v_std_checkin text := COALESCE(v_rules->>'check_in', '14:00');
            v_std_checkout text := COALESCE(v_rules->>'check_out', '12:00');
            v_full_early text := COALESCE(v_rules->>'full_day_early_before', '05:00');
            v_full_late text := COALESCE(v_rules->>'full_day_late_after', '18:00');
        BEGIN
            v_days := v_nights;
            
            IF COALESCE((v_rules->>'enableAutoSurcharge')::boolean, true) THEN
                -- Early Check-in Daily
                IF v_check_in_time < v_std_checkin THEN
                    IF v_check_in_time < v_full_early THEN
                        v_days := v_days + 1;
                    ELSE
                        v_early_surcharge := public.get_applicable_surcharge(v_check_in, v_rules->'early_rules', v_price_daily);
                    END IF;
                END IF;
                
                -- Late Check-out Daily
                IF v_check_out > ((v_check_out AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_std_checkout::time + (v_daily_grace_hours || ' hours')::interval) AT TIME ZONE 'Asia/Ho_Chi_Minh' THEN
                    IF v_check_out_time > v_full_late THEN
                        v_days := v_days + 1;
                    ELSE
                        v_late_surcharge := public.get_applicable_surcharge(v_check_out, v_rules->'late_rules', v_price_daily);
                    END IF;
                END IF;
            END IF;
            
            v_base_charge := v_days * v_price_daily;
            v_duration_text := v_days || ' ngày';
            v_surcharge := v_early_surcharge + v_late_surcharge;
            
            v_summary := jsonb_build_object(
                'base_price', v_price_daily,
                'days', v_days,
                'early_checkin_surcharge', v_early_surcharge,
                'late_checkout_surcharge', v_late_surcharge
            );
        END;
    END IF;

    -- 5. Tính tiền dịch vụ
    IF v_booking.services_used IS NOT NULL THEN
        FOR v_service_item IN SELECT * FROM jsonb_array_elements(v_booking.services_used)
        LOOP
            v_service_total := v_service_total + (public.safe_parse_numeric(v_service_item->>'price') * public.safe_parse_numeric(v_service_item->>'quantity'));
        END LOOP;
    END IF;

    -- 6. Ưu tiên giá phòng đã chốt (Room Charge Locked)
    IF v_booking.room_charge_locked > 0 THEN
        v_base_charge := v_booking.room_charge_locked;
    END IF;

    -- 7. Tính thuế
    v_room_tax := ((v_base_charge + v_surcharge + COALESCE(v_booking.custom_surcharge, 0)) * COALESCE((v_tax_config->>'stay_tax')::numeric, 0)) / 100;
    v_service_tax := (v_service_total * COALESCE((v_tax_config->>'service_tax')::numeric, 0)) / 100;
    
    -- 8. Tổng hợp doanh thu đơn phòng này
    v_booking_revenue := v_base_charge + v_surcharge + COALESCE(v_booking.custom_surcharge, 0) + v_service_total + v_room_tax + v_service_tax;

    -- 9. Tính tổng tiền cần thanh toán (bao gồm nợ cũ và trừ tiền cọc)
    -- Balance < 0 là nợ, nên ta trừ đi số âm => cộng thêm vào tổng phải trả
    -- Deposit_amount > 0 là tiền đã trả trước, nên ta trừ đi
    v_final_total_to_pay := v_booking_revenue - v_customer_balance - v_deposit_amount;

    -- 10. Kết quả trả về
    RETURN jsonb_build_object(
        'success', true,
        'total_amount', ROUND(v_final_total_to_pay), -- Con số cuối cùng khách cần trả (đã trừ cọc, cộng nợ)
        'booking_revenue', ROUND(v_booking_revenue), -- Doanh thu thực tế của đơn này
        'room_charge', ROUND(v_base_charge),
        'service_charge', ROUND(v_service_total),
        'surcharge', ROUND(v_surcharge + COALESCE(v_booking.custom_surcharge, 0)),
        'deposit_amount', v_deposit_amount,
        'customer_balance', v_customer_balance,
        'tax_details', jsonb_build_object(
            'room_tax', ROUND(v_room_tax),
            'service_tax', ROUND(v_service_tax)
        ),
        'summary', v_summary || jsonb_build_object(
            'rental_type', v_rental_type,
            'duration_text', v_duration_text,
            'check_in', v_check_in,
            'check_out', v_check_out
        )
    );
END;
$$;

-- 3. Cập nhật handle_checkout: Sử dụng Pricing Brain V2 làm Source of Truth
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_amount_paid numeric, -- Số tiền thực trả lần này
    p_payment_method text DEFAULT 'CASH',
    p_surcharge numeric DEFAULT 0, -- Phụ phí thủ công lúc checkout
    p_notes text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_total_amount numeric DEFAULT NULL, -- THAM SỐ CŨ
    p_debt_carry_amount numeric DEFAULT 0 -- THAM SỐ CŨ
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_booking_revenue numeric;
    v_room_id uuid;
    v_customer_id uuid;
    v_result jsonb;
BEGIN
    -- 1. Lấy hóa đơn từ Database
    v_bill := public.calculate_booking_bill_v2(p_booking_id);
    IF NOT (v_bill->>'success')::boolean THEN
        RETURN v_bill;
    END IF;

    -- 2. Lấy doanh thu của riêng đơn này (không bao gồm nợ cũ, không bao gồm cọc)
    v_booking_revenue := (v_bill->>'booking_revenue')::numeric + p_surcharge;

    -- 3. Lấy thông tin booking
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    v_room_id := v_booking.room_id;
    v_customer_id := v_booking.customer_id;

    -- 4. Cập nhật trạng thái Booking
    UPDATE public.bookings
    SET status = 'completed',
        check_out_at = now(),
        total_amount = v_booking_revenue, -- Chỉ lưu doanh thu đơn này
        surcharge = COALESCE(surcharge, 0) + p_surcharge,
        notes = COALESCE(notes, '') || E'\n' || COALESCE(p_notes, ''),
        payment_method = p_payment_method
    WHERE id = p_booking_id;

    -- 5. Cập nhật trạng thái Phòng
    UPDATE public.rooms
    SET status = 'available',
        current_booking_id = NULL,
        last_status_change = now()
    WHERE id = v_room_id;

    -- 6. Ghi Ledger (Doanh thu & Thanh toán)
    INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
    VALUES (p_booking_id, v_customer_id, 'REVENUE', 'ROOM', (v_bill->>'room_charge')::numeric, 'Doanh thu tiền phòng', p_staff_id, p_payment_method);

    IF (v_bill->>'service_charge')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SERVICE', (v_bill->>'service_charge')::numeric, 'Doanh thu dịch vụ', p_staff_id, p_payment_method);
    END IF;

    IF (v_bill->>'surcharge')::numeric + p_surcharge > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SURCHARGE', (v_bill->>'surcharge')::numeric + p_surcharge, 'Phụ phí checkout', p_staff_id, p_payment_method);
    END IF;

    DECLARE
        v_tax_total numeric := (v_bill->'tax_details'->>'room_tax')::numeric + (v_bill->'tax_details'->>'service_tax')::numeric;
    BEGIN
        IF v_tax_total > 0 THEN
            INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
            VALUES (p_booking_id, v_customer_id, 'REVENUE', 'TAX', v_tax_total, 'Thuế GTGT', p_staff_id, p_payment_method);
        END IF;
    END;

    -- Ghi nhận số tiền thực thu
    IF p_amount_paid > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'PAYMENT', 'ROOM', p_amount_paid, 'Khách thanh toán checkout', p_staff_id, p_payment_method);
    END IF;

    -- 7. Cập nhật Balance Khách hàng
    -- Balance mới = Balance cũ - Doanh thu mới + Thanh toán mới
    UPDATE public.customers
    SET balance = COALESCE(balance, 0) - v_booking_revenue + p_amount_paid,
        total_spent = COALESCE(total_spent, 0) + v_booking_revenue,
        last_visit = now()
    WHERE id = v_customer_id;

    -- 8. Tạo Invoice
    INSERT INTO public.invoices (booking_id, customer_id, room_id, total_amount, payment_method, created_at)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_booking_revenue, p_payment_method, now());

    -- 9. Trả về kết quả
    v_result := jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'total_to_pay', (v_bill->>'total_amount')::numeric + p_surcharge, -- Số tiền cuối cùng cần thanh toán
        'booking_revenue', v_booking_revenue,
        'bill_details', v_bill
    );

    RETURN v_result;
END;
$$;
