
--- fn_apply_wallet_logic ---
CREATE OR REPLACE FUNCTION public.fn_apply_wallet_logic(p_rec record, p_sign_multiplier integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_amount numeric := COALESCE(p_rec.amount, 0);
    v_flow_sign integer := CASE WHEN p_rec.flow_type = 'IN' THEN 1 ELSE -1 END;
    v_final_sign integer := v_flow_sign * p_sign_multiplier;      
    v_method text := lower(COALESCE(p_rec.payment_method_code, 'cash'));
BEGIN
    -- 1. CREDIT (Ghi nợ - Doanh thu Accrual): Tăng Nợ, Tăng Doanh thu
    -- Áp dụng cho: Tiền phòng (Checkout), Dịch vụ (Order), Phụ thu
    IF v_method = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
        RETURN;
    END IF;

    -- 2. DEPOSIT TRANSFER (Cấn trừ cọc): Giảm Escrow, Giảm Nợ (Không tác động Revenue)
    IF v_method = 'deposit_transfer' THEN
        -- Giảm Escrow (Bản chất là lấy tiền ra khỏi Escrow để trả nợ)
        -- Flow IN vào booking, nhưng là nguồn từ Escrow.
        -- Quy ước: Amount dương. 
        -- Logic: Escrow GIẢM, Receivable GIẢM.
        -- Vì flow_type='IN' (Payment), v_final_sign = 1.
        -- Ta cần TRỪ vào Escrow và TRỪ vào Receivable.
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'ESCROW';
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN;
    END IF;

    -- 3. DEPOSIT FLOWS (Tiền cọc)
    IF p_rec.category = 'Tiền cọc' OR p_rec.category = 'Hoàn cọc' THEN
        -- A. Thu cọc (IN): Tăng Cash, Tăng Escrow
        IF p_rec.flow_type = 'IN' THEN
            IF v_method = 'cash' THEN
                UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
            ELSE
                UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
            END IF;
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'ESCROW';
            RETURN;
        END IF;

        -- B. Hoàn cọc (OUT): Giảm Cash, Giảm Escrow
        IF p_rec.flow_type = 'OUT' THEN
             IF v_method = 'cash' THEN
                UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH'; -- v_final_sign is negative
            ELSE
                UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
            END IF;
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'ESCROW';
            RETURN;
        END IF;
    END IF;

    -- 4. STANDARD PAYMENT (Thanh toán nợ): Tăng Cash, Giảm Nợ
    -- Flow IN, method cash/bank
    IF p_rec.flow_type = 'IN' THEN
        IF v_method = 'cash' THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
        ELSE
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        
        -- Khách trả tiền -> Giảm nợ (Receivable)
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN;
    END IF;

    -- 5. EXPENSE (Chi phí): Giảm Cash, Tăng Expense (hoặc Giảm Revenue nếu muốn P&L đơn giản)
    -- Ở đây ta tạm thời trừ vào Revenue cho đơn giản (theo mô hình Revenue - Expense)
    IF p_rec.flow_type = 'OUT' THEN
        IF v_method = 'cash' THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
        ELSE
             UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        
        -- Ghi nhận chi phí (Giảm Revenue)
         UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
         RETURN;
    END IF;

END;
$function$
;

--- trg_update_wallets NOT FOUND ---

--- process_checkout ---
CREATE OR REPLACE FUNCTION public.process_checkout(p_booking_id uuid, p_payment_method text, p_amount_paid numeric, p_discount numeric, p_surcharge numeric, p_notes text, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_room_id uuid;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());
    
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- 1. Update Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Record Cash Flow (Dòng tiền)
    BEGIN
        IF p_amount_paid > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, 
                category, 
                amount, 
                description, 
                created_by, 
                ref_id, 
                is_auto, 
                occurred_at,
                payment_method_code
            )
            VALUES (
                'IN', 
                'Tiền phòng', 
                p_amount_paid, 
                'Thanh toán checkout phòng ' || COALESCE(v_bill->>'room_name', '???') || ' - ' || COALESCE(v_bill->>'customer_name', 'Khách lẻ'), 
                v_staff_id, 
                p_booking_id, 
                true, 
                now(),
                lower(p_payment_method)
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN 
        -- Log error to audit_logs instead of silent fail
        INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
        VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, 0, to_jsonb(ARRAY['Lỗi ghi nhận dòng tiền: ' || SQLERRM]));
    END;

    -- 5. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 6. Record Audit Log (Lưu vết tính toán)
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- 7. Lưu giải trình vào Booking (Audit Trail)
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$
;

--- check_in_customer ---
CREATE OR REPLACE FUNCTION public.check_in_customer(p_room_id uuid, p_rental_type text, p_customer_id uuid DEFAULT NULL::uuid, p_deposit numeric DEFAULT 0, p_services jsonb DEFAULT '[]'::jsonb, p_customer_name text DEFAULT NULL::text, p_extra_adults integer DEFAULT 0, p_extra_children integer DEFAULT 0, p_notes text DEFAULT NULL::text, p_custom_price numeric DEFAULT NULL::numeric, p_custom_price_reason text DEFAULT NULL::text, p_source text DEFAULT 'direct'::text, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_booking_id uuid;
    v_customer_id uuid;
    v_staff_id uuid;
    v_staff_name text;
    v_room_status text;
    v_room_name text;
    v_check_in_at timestamptz := now();
BEGIN
    -- Identify Staff
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

    -- Get Room Info
    SELECT status, room_number INTO v_room_status, v_room_name FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.');
    END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.');
    END IF;

    -- Handle Customer
    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name) VALUES (p_customer_name) RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    -- 1. Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, check_in_actual, deposit_amount, payment_method, 
        status, notes, services_used, extra_adults, extra_children, 
        custom_price, custom_price_reason, source, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, v_check_in_at, p_deposit, p_payment_method, 
        'checked_in', p_notes, p_services, p_extra_adults, p_extra_children, 
        p_custom_price, p_custom_price_reason, p_source, v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name)
    ) RETURNING id INTO v_booking_id;

    -- 2. Update Room Status
    UPDATE public.rooms SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = v_check_in_at WHERE id = p_room_id;

    -- 3. INITIAL ROOM CHARGE (Snapshot Principle)
    DECLARE
        v_room_cat_id uuid;
        v_initial_bill jsonb;
        v_initial_amount numeric;
    BEGIN
        SELECT category_id INTO v_room_cat_id FROM public.rooms WHERE id = p_room_id;
        
        v_initial_bill := public.fn_calculate_room_charge(
            v_booking_id, v_check_in_at, v_check_in_at, p_rental_type, v_room_cat_id
        );
        v_initial_amount := (v_initial_bill->>'amount')::numeric;

        -- FIX: Hourly Room starts with 0 Debt (Snapshot Principle)
        IF p_rental_type = 'hourly' THEN
            v_initial_amount := 0;
        END IF;

        IF v_initial_amount > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, payment_method_code, 
                created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at
            )
            VALUES (
                'IN', 'Tiền phòng', v_initial_amount, 
                format('Ghi nhận nợ tiền phòng (%s) lúc nhận phòng', p_rental_type), 
                'credit', -- Increases Receivable & Revenue
                auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now()
            );
        END IF;
    END;

    -- 4. RECORD DEPOSIT
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, payment_method_code, 
            created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at
        )
        VALUES (
            'IN', 'Tiền cọc', p_deposit, 
            'Tiền cọc phòng ' || COALESCE(v_room_name, ''), 
            p_payment_method, -- cash/bank
            auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now()
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$
;

--- calculate_booking_bill ---
CREATE OR REPLACE FUNCTION public.calculate_booking_bill(p_booking_id uuid, p_now_override timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
 DECLARE
     v_booking record;
     v_room_cat_id uuid;
     v_check_out timestamptz;
     v_room_res jsonb;
     v_surcharge_res jsonb;
     v_extra_person_res jsonb;
     v_adj_res jsonb;
     v_service_total numeric := 0;
     v_service_items jsonb;
     v_total_amount numeric;
     v_deposit numeric;
     v_customer_balance numeric;
     v_duration_hours numeric;
     v_duration_minutes numeric;
     v_audit_trail text[] := '{}';
     v_tz text := 'Asia/Ho_Chi_Minh';
 BEGIN
     SELECT 
         b.*, r.category_id, r.room_number as room_name,
         c.balance as cust_balance, c.full_name as cust_name
     INTO v_booking 
     FROM public.bookings b
     JOIN public.rooms r ON b.room_id = r.id
     LEFT JOIN public.customers c ON b.customer_id = c.id
     WHERE b.id = p_booking_id;
     
     IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;
     
     v_check_out := COALESCE(p_now_override, v_booking.check_out_actual, now());
     v_room_cat_id := v_booking.category_id;
     v_customer_balance := COALESCE(v_booking.cust_balance, 0);
     v_deposit := COALESCE(v_booking.deposit_amount, 0);
     
     v_duration_minutes := FLOOR(EXTRACT(EPOCH FROM (v_check_out - v_booking.check_in_actual)) / 60);
     v_duration_hours := FLOOR(v_duration_minutes / 60);
     v_duration_minutes := MOD(v_duration_minutes::int, 60);
 
     -- 1. Room Charge
   v_room_res := public.fn_calculate_room_charge(p_booking_id, v_booking.check_in_actual, v_check_out, v_booking.rental_type, v_room_cat_id);
   v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_room_res->'explanation') = 'array' THEN v_room_res->'explanation' ELSE '[]'::jsonb END) AS x);
   
   -- 2. Early/Late Surcharge
   -- [FIX] Use actual rental type (in case it switched from Hourly -> Daily)
   v_surcharge_res := public.fn_calculate_surcharge(v_booking.check_in_actual, v_check_out, v_room_cat_id, COALESCE(v_room_res->>'rental_type_actual', v_booking.rental_type));
   v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_surcharge_res->'explanation') = 'array' THEN v_surcharge_res->'explanation' ELSE '[]'::jsonb END) AS x);
    
    -- 3. Extra Person
    v_extra_person_res := public.fn_calculate_extra_person_charge(p_booking_id);
    v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_extra_person_res->'explanation') = 'array' THEN v_extra_person_res->'explanation' ELSE '[]'::jsonb END) AS x);

    -- 4. Services
    SELECT 
        COALESCE(SUM(quantity * price_at_time), 0),
        COALESCE(jsonb_agg(jsonb_build_object('name', s.name, 'quantity', bs.quantity, 'price', bs.price_at_time, 'total', bs.quantity * bs.price_at_time)), '[]'::jsonb)
    INTO v_service_total, v_service_items
    FROM public.booking_services bs
    JOIN public.services s ON bs.service_id = s.id
    WHERE bs.booking_id = p_booking_id;

    IF v_service_total > 0 THEN
        v_audit_trail := array_append(v_audit_trail, format('Dịch vụ: %s', public.fn_format_money_vi(v_service_total)));
    END IF;

    v_total_amount := COALESCE((v_room_res->>'amount')::numeric, 0) + 
                      COALESCE((v_surcharge_res->>'amount')::numeric, 0) + 
                      COALESCE((v_extra_person_res->>'amount')::numeric, 0) + 
                      v_service_total;

    -- 5. VAT, SVC, Discounts
    v_adj_res := public.fn_calculate_bill_adjustments(
        v_total_amount, 
        COALESCE(v_booking.discount_amount, 0), 
        COALESCE(v_booking.custom_surcharge, 0)
    );
    v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_adj_res->'explanation') = 'array' THEN v_adj_res->'explanation' ELSE '[]'::jsonb END) AS x);

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'room_name', v_booking.room_name,
        'customer_name', COALESCE(v_booking.cust_name, 'Khách lẻ'),
        'rental_type', v_booking.rental_type,
        'rental_type_actual', COALESCE(v_room_res->>'rental_type_actual', v_booking.rental_type),
        'check_in_at', v_booking.check_in_actual,
        'check_out_at', v_check_out,
        'duration_hours', v_duration_hours,
        'duration_minutes', v_duration_minutes,
        
        'room_charge', COALESCE((v_room_res->>'amount')::numeric, 0),
        'surcharge_amount', COALESCE((v_surcharge_res->>'amount')::numeric, 0),
        'extra_person_charge', COALESCE((v_extra_person_res->>'amount')::numeric, 0),
        'service_total', v_service_total,
        'service_items', v_service_items,
        
        'sub_total', v_total_amount,
        'discount_amount', COALESCE(v_booking.discount_amount, 0),
        'custom_surcharge', COALESCE(v_booking.custom_surcharge, 0),
        'service_fee_amount', COALESCE((v_adj_res->>'service_fee')::numeric, 0),
        'vat_amount', COALESCE((v_adj_res->>'vat_amount')::numeric, 0),
        
        'total_amount', COALESCE((v_adj_res->>'final_amount')::numeric, 0),
        'deposit_amount', v_deposit,
        'amount_to_pay', COALESCE((v_adj_res->>'final_amount')::numeric, 0) - v_deposit,
        'customer_balance', v_customer_balance,
        'explanation', v_audit_trail
    );
 END;
 $function$
;

--- fn_calculate_room_charge ---
CREATE OR REPLACE FUNCTION public.fn_calculate_room_charge(p_booking_id uuid, p_check_in timestamp with time zone, p_check_out timestamp with time zone, p_rental_type text, p_room_cat_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    -- Settings variables
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_grace_minutes int;
    v_hourly_unit int;
    v_base_block_count int;
    v_ceiling_enabled boolean;
    v_ceiling_percent numeric;
    v_overnight_start time;
    v_overnight_end time;
    v_std_check_out time;
    v_full_day_cutoff time;
    v_full_day_early_cutoff time;
    
    -- New toggles
    v_auto_overnight_switch boolean;
    v_auto_full_day_early boolean;
    v_auto_full_day_late boolean;
    
    -- Price variables
    v_price_hourly numeric;
    v_price_next numeric;
    v_price_daily numeric;
    v_price_overnight numeric;
    v_overnight_enabled boolean;
    
    -- Custom price
    v_custom_price numeric;
   
   v_duration_minutes numeric;
   v_total_charge numeric := 0;
   v_explanations text[] := '{}';
   v_ceiling_amount numeric;
   
   v_first_block_min numeric;
   v_remaining_min numeric;
   v_next_blocks int;
   v_check_in_time time;
   v_rental_type_actual text := p_rental_type;
   v_tz text := 'Asia/Ho_Chi_Minh';
BEGIN
    -- 1. Load settings from COLUMNS
    SELECT 
        grace_in_enabled,
        grace_out_enabled,
        grace_minutes,
        hourly_unit,
        base_hourly_limit,
        hourly_ceiling_enabled,
        hourly_ceiling_percent,
        overnight_start_time,
        overnight_end_time,
        check_out_time,
        full_day_late_after,
        night_audit_time,
        auto_overnight_switch,
        auto_full_day_early,
        auto_full_day_late
    INTO 
        v_grace_in_enabled, v_grace_out_enabled, v_grace_minutes,
        v_hourly_unit, v_base_block_count, v_ceiling_enabled,
        v_ceiling_percent, v_overnight_start, v_overnight_end,
        v_std_check_out, v_full_day_cutoff, v_full_day_early_cutoff,
        v_auto_overnight_switch, v_auto_full_day_early, v_auto_full_day_late
    FROM public.settings WHERE key = 'config' LIMIT 1;

    -- [HỢP NHẤT] Mốc vào sớm tính thêm 1 ngày chính là mốc Night Audit
    IF v_full_day_early_cutoff IS NULL THEN
        v_full_day_early_cutoff := '04:00:00'::time;
    END IF;
    
    -- 1.1. Validate Settings (CƯỞNG CHẾ: Không dùng thông số cứng)
    IF v_std_check_out IS NULL OR v_overnight_start IS NULL OR v_overnight_end IS NULL OR v_hourly_unit IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'LỖI CẤU HÌNH: Bệ hạ chưa thiết lập đầy đủ các thông số (Check-out, Qua đêm, Block giờ...) trong Cài đặt. Không thể tính tiền.'
        );
    END IF;

    -- 2. Load prices from room_categories
    SELECT 
        COALESCE(price_hourly, 0), 
        COALESCE(price_next_hour, 0), 
        COALESCE(price_daily, 0), 
        COALESCE(price_overnight, 0),
        COALESCE(overnight_enabled, false), 
        COALESCE(hourly_unit, 60), 
        COALESCE(base_hourly_limit, 1)
    INTO 
        v_price_hourly, v_price_next, v_price_daily, v_price_overnight,
        v_overnight_enabled, v_hourly_unit, v_base_block_count
    FROM public.room_categories 
    WHERE id = p_room_cat_id;

    -- 3. Load Custom Price from Booking
    SELECT COALESCE(custom_price, 0) INTO v_custom_price FROM public.bookings WHERE id = p_booking_id;
    v_custom_price := COALESCE(v_custom_price, 0);
    
    -- Apply Overrides (Priority: Custom Price > Category Price)
    IF v_custom_price > 0 THEN
        IF p_rental_type = 'hourly' THEN 
            v_price_hourly := v_custom_price;
            v_explanations := array_append(v_explanations, format('Giá phòng thỏa thuận (Theo giờ): %sđ', public.fn_format_money_vi(v_custom_price)));
        ELSIF p_rental_type = 'overnight' THEN 
            v_price_overnight := v_custom_price;
            v_explanations := array_append(v_explanations, format('Giá phòng thỏa thuận (Qua đêm): %sđ', public.fn_format_money_vi(v_custom_price)));
        ELSE 
            v_price_daily := v_custom_price;
            v_explanations := array_append(v_explanations, format('Giá phòng thỏa thuận (Theo ngày): %sđ', public.fn_format_money_vi(v_custom_price)));
        END IF;
    END IF;

    -- v_hourly_unit và v_base_block_count đã được load từ settings/category

    v_duration_minutes := FLOOR(EXTRACT(EPOCH FROM (p_check_out - p_check_in)) / 60);
    v_check_in_time := (p_check_in AT TIME ZONE v_tz)::time;
    
    -- [Gạt] Auto-switch to Overnight logic
    IF v_auto_overnight_switch AND p_rental_type IN ('hourly', 'daily') AND v_overnight_enabled THEN
        IF (v_check_in_time >= v_overnight_start OR v_check_in_time <= v_overnight_end) THEN
            v_rental_type_actual := 'overnight';
            v_explanations := array_append(v_explanations, format('Tự động áp dụng giá Qua đêm (Khách nhận phòng lúc %s, thuộc khung giờ %s - %s)', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_overnight_start, 'HH24:MI'), to_char(v_overnight_end, 'HH24:MI')));
        END IF;
    END IF;

    -- [Gạt] Auto-switch Hourly -> Daily (Ceiling Check)
    IF v_rental_type_actual = 'hourly' AND v_ceiling_enabled THEN
        DECLARE
            v_tmp_charge numeric := v_price_hourly;
            v_tmp_remaining numeric;
            v_tmp_blocks int;
        BEGIN
            v_first_block_min := v_base_block_count * v_hourly_unit;
            
            IF v_duration_minutes > v_first_block_min THEN
                v_tmp_remaining := v_duration_minutes - v_first_block_min;
                IF v_grace_out_enabled AND v_tmp_remaining <= v_grace_minutes THEN
                    v_tmp_remaining := 0;
                END IF;
                
                IF v_tmp_remaining > 0 THEN
                    v_tmp_blocks := CEIL(v_tmp_remaining / v_hourly_unit);
                    v_tmp_charge := v_tmp_charge + (v_tmp_blocks * v_price_next);
                END IF;
            END IF;

            v_ceiling_amount := v_price_daily * (v_ceiling_percent / 100);
            
            IF v_tmp_charge > v_ceiling_amount THEN
                v_rental_type_actual := 'daily';
                v_explanations := array_append(v_explanations, format('Tiền giờ (%sđ) vượt trần giá ngày (%sđ) -> Chuyển sang tính giá Ngày', public.fn_format_money_vi(v_tmp_charge), public.fn_format_money_vi(v_ceiling_amount)));
            END IF;
        END;
    END IF;

    IF v_rental_type_actual = 'hourly' THEN
        v_explanations := array_append(v_explanations, 'Loại hình: Thuê theo giờ');
        v_first_block_min := v_base_block_count * v_hourly_unit;
        v_total_charge := v_price_hourly;
        v_explanations := array_append(v_explanations, format('Giờ đầu tiên (%s phút): %sđ', v_first_block_min, public.fn_format_money_vi(v_price_hourly)));
        
        IF v_duration_minutes > v_first_block_min THEN
            v_remaining_min := v_duration_minutes - v_first_block_min;
            -- [LOGIC MỚI] Khoan hồng từng Block (Grace per Block)
            -- Nguyên tắc: Tính số block trọn vẹn + Xử lý phần dư của block cuối cùng
            
            DECLARE
                v_remainder_min numeric;
            BEGIN
                -- Tính số block trọn vẹn (ví dụ: 65 phút / 60 = 1 block trọn)
                v_next_blocks := FLOOR(v_remaining_min / v_hourly_unit);
                
                -- Tính phần dư (ví dụ: 65 % 60 = 5 phút)
                v_remainder_min := MOD(v_remaining_min, v_hourly_unit);
                
                IF v_remainder_min > 0 THEN
                    -- Nếu phần dư > ân hạn -> Tính thêm 1 block
                    IF (NOT v_grace_out_enabled) OR (v_remainder_min > v_grace_minutes) THEN
                        v_next_blocks := v_next_blocks + 1;
                        v_explanations := array_append(v_explanations, format('Block lẻ %s phút (> %s phút ân hạn) -> Tính tròn 1 block', ROUND(v_remainder_min, 0), v_grace_minutes));
                    ELSE
                        -- Nếu phần dư <= ân hạn -> Miễn phí block này
                        v_explanations := array_append(v_explanations, format('Block lẻ %s phút (<= %s phút ân hạn) -> Miễn phí', ROUND(v_remainder_min, 0), v_grace_minutes));
                    END IF;
                END IF;
            END;

            IF v_next_blocks > 0 THEN
                v_total_charge := v_total_charge + (v_next_blocks * v_price_next);
                v_explanations := array_append(v_explanations, format('Tổng tính thêm: %s block x %sđ = %sđ', 
                    v_next_blocks, public.fn_format_money_vi(v_price_next), public.fn_format_money_vi(v_next_blocks * v_price_next)));
            END IF;
        END IF;
        
        -- Khống chế giá giờ: Đã xử lý ở bước kiểm tra chuyển đổi sang Ngày phía trên


    ELSIF v_rental_type_actual = 'overnight' THEN
        DECLARE
            v_nights int;
        BEGIN
            v_nights := ((p_check_out AT TIME ZONE v_tz)::date - (p_check_in AT TIME ZONE v_tz)::date);
            IF v_nights < 1 THEN v_nights := 1; END IF;

            IF v_overnight_enabled = true AND (v_check_in_time >= v_overnight_start OR v_check_in_time <= v_overnight_end) THEN
                 v_total_charge := v_nights * v_price_overnight;
                 v_explanations := array_append(v_explanations, format('Tiền phòng qua đêm (%s đêm x %sđ): %sđ', v_nights, public.fn_format_money_vi(v_price_overnight), public.fn_format_money_vi(v_total_charge)));
            ELSE
                 v_total_charge := v_nights * v_price_daily;
                 v_explanations := array_append(v_explanations, format('Nhận phòng lúc %s (ngoài khung qua đêm %s-%s): Chuyển sang tính giá ngày (%s ngày x %sđ) = %sđ', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_overnight_start, 'HH24:MI'), to_char(v_overnight_end, 'HH24:MI'), v_nights, public.fn_format_money_vi(v_price_daily), public.fn_format_money_vi(v_total_charge)));
            END IF;
        END;

    ELSE -- Daily
        DECLARE
            v_days int;
            v_check_out_time time;
            v_check_in_time_only time;
            v_late_min numeric;
            v_early_min numeric;
            v_std_check_in time;
        BEGIN
           SELECT COALESCE(check_in_time, NULL) INTO v_std_check_in FROM public.settings WHERE key = 'config' LIMIT 1;

           v_days := ((p_check_out AT TIME ZONE v_tz)::date - (p_check_in AT TIME ZONE v_tz)::date);
           
           IF v_days < 0 THEN v_days := 0; END IF;

           -- 1. Check Late Check-out (Full day charge)
           v_check_out_time := (p_check_out AT TIME ZONE v_tz)::time;
           v_late_min := FLOOR(EXTRACT(EPOCH FROM (v_check_out_time - v_std_check_out)) / 60);
           
           -- [Gạt] Sau mốc giờ tự động tính thêm 1 ngày
           IF v_auto_full_day_late AND (v_check_out_time > v_full_day_cutoff) THEN
               IF NOT (v_grace_out_enabled AND v_late_min <= v_grace_minutes) THEN
                   v_days := v_days + 1;
                   v_explanations := array_append(v_explanations, format('Trả phòng lúc %s (sau %s): Tính thêm 1 ngày phòng', to_char(p_check_out AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_full_day_cutoff, 'HH24:MI')));
               ELSE
                   v_explanations := array_append(v_explanations, format('Trả muộn %s phút (trong mức miễn phí %s phút): Không tính thêm ngày', ROUND(v_late_min,0), v_grace_minutes));
               END IF;
           END IF;

           -- 2. Check Early Check-in (Full day charge)
           v_check_in_time_only := (p_check_in AT TIME ZONE v_tz)::time;
           v_early_min := FLOOR(EXTRACT(EPOCH FROM (v_std_check_in - v_check_in_time_only)) / 60);

           -- [Gạt] Vào trước mốc Night Audit tự động tính thêm 1 ngày
           IF v_auto_full_day_early AND (v_check_in_time_only < v_full_day_early_cutoff) THEN
               IF NOT (v_grace_in_enabled AND v_early_min <= v_grace_minutes) THEN
                   v_days := v_days + 1;
                   v_explanations := array_append(v_explanations, format('Nhận phòng lúc %s (trước mốc Night Audit %s): Tính thêm 1 ngày phòng', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_full_day_early_cutoff, 'HH24:MI')));
               ELSE
                   v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (trong mức miễn phí %s phút): Không tính thêm ngày', ROUND(v_early_min,0), v_grace_minutes));
               END IF;
           END IF;
           
           IF v_days < 1 THEN 
               v_days := 1; 
               v_explanations := array_append(v_explanations, 'Thời gian ở tối thiểu: Tính 1 ngày phòng');
           END IF;
           
           v_total_charge := v_days * v_price_daily;
           v_explanations := array_append(v_explanations, format('Tiền phòng theo ngày (%s ngày x %sđ): %sđ', v_days, public.fn_format_money_vi(v_price_daily), public.fn_format_money_vi(v_total_charge)));
        END;
    END IF;

    RETURN jsonb_build_object(
        'amount', v_total_charge,
        'explanation', v_explanations,
        'duration_minutes', v_duration_minutes,
        'rental_type_actual', v_rental_type_actual
    );
END;
$function$
;

--- TRIGGERS ON cash_flow ---
-- tr_cash_flow_updated_at
CREATE TRIGGER tr_cash_flow_updated_at BEFORE UPDATE ON public.cash_flow FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
-- trg_protect_cash_flow
CREATE TRIGGER trg_protect_cash_flow BEFORE DELETE OR UPDATE ON public.cash_flow FOR EACH ROW EXECUTE FUNCTION fn_prevent_modification();
-- trg_sync_wallets_master
CREATE TRIGGER trg_sync_wallets_master AFTER INSERT OR DELETE OR UPDATE ON public.cash_flow FOR EACH ROW EXECUTE FUNCTION fn_sync_wallets();
