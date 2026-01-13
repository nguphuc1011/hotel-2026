-- RPC: process_checkout_v3
-- Thực hiện toàn bộ quy trình checkout trong một transaction duy nhất
-- Tuân thủ rule.md: DB-first, single source of truth

-- Đảm bảo cột payment_method tồn tại trong bảng bookings
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='payment_method') THEN
        ALTER TABLE bookings ADD COLUMN payment_method text;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_checkout_v3(
    p_booking_id uuid,
    p_payment_method text,
    p_amount_paid numeric,
    p_discount numeric,
    p_surcharge numeric,
    p_notes text,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
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
    
    -- 1. Lấy thông tin cơ bản
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- 2. Cập nhật booking với các thông số checkout (để hàm bill tính toán đúng)
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_at = now(), -- Sửa từ check_out_actual thành check_out_at
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- 3. Gọi hàm tính bill V3 để lấy con số cuối cùng
    v_bill := public.get_booking_bill_v3(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit')::numeric;

    -- 4. Cập nhật trạng thái phòng
    UPDATE public.rooms 
    SET 
        status = 'dirty', 
        current_booking_id = NULL,
        last_status_change = now()
    WHERE id = v_room_id;

    -- 5. Ghi Ledger (Kế toán)
    -- Doanh thu phòng
    INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
    VALUES (p_booking_id, v_customer_id, 'REVENUE', 'ROOM', (v_bill->>'room_charge')::numeric, 'Tiền phòng', v_staff_id, p_payment_method);

    -- Doanh thu dịch vụ
    IF (v_bill->>'service_total')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SERVICE', (v_bill->>'service_total')::numeric, 'Dịch vụ', v_staff_id, p_payment_method);
    END IF;

    -- Phụ thu (Surcharge + Extra Person + Custom Surcharge)
    IF (v_bill->>'surcharge')::numeric > 0 OR (v_bill->>'extra_person')::numeric > 0 OR (v_bill->>'custom_surcharge')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SURCHARGE', 
            COALESCE((v_bill->>'surcharge')::numeric, 0) + 
            COALESCE((v_bill->>'extra_person')::numeric, 0) + 
            COALESCE((v_bill->>'custom_surcharge')::numeric, 0), 
            'Phụ thu', v_staff_id, p_payment_method);
    END IF;

    -- Giảm giá (ghi như một khoản chi phí hoặc giảm trừ)
    IF (v_bill->>'discount_amount')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'EXPENSE', 'DISCOUNT', (v_bill->>'discount_amount')::numeric, 'Giảm giá', v_staff_id, p_payment_method);
    END IF;

    -- Ghi nhận thanh toán thực tế tại quầy
    IF p_amount_paid > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'PAYMENT', 'ROOM', p_amount_paid, 'Khách thanh toán checkout', v_staff_id, p_payment_method);
    END IF;

    -- 6. Cập nhật hồ sơ khách hàng (nếu có khách)
    IF v_customer_id IS NOT NULL THEN
        -- Số dư mới = Số dư cũ + Tiền trả thêm - (Tổng bill - Tiền cọc)
        UPDATE public.customers 
        SET 
            balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit),
            total_spent = COALESCE(total_spent, 0) + v_total_amount,
            last_visit = now(),
            visit_count = COALESCE(visit_count, 0) + 1
        WHERE id = v_customer_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Check-out thành công',
        'bill', v_bill
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 
        'message', 'Lỗi: ' || SQLERRM
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
