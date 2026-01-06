-- ==========================================
-- UNIFIED PRICING BRAIN & SECURE CHECKOUT
-- Date: 2026-01-07
-- Description: 
--  1. Chuyển toàn bộ logic tính toán tiền phòng/dịch vụ về Database.
--  2. Loại bỏ sự phụ thuộc vào p_total_amount từ client để chống gian lận.
--  3. Thống nhất cách tính công nợ.
-- ==========================================

-- 1. HÀM TÍNH TOÁN CHI TIẾT HÓA ĐƠN (Source of Truth)
CREATE OR REPLACE FUNCTION public.calculate_booking_bill(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_room_charge numeric;
    v_service_charge numeric;
    v_surcharge numeric;
    v_total_amount numeric;
    v_deposit numeric;
    v_stay_duration interval;
    v_stay_days int;
BEGIN
    -- Lấy thông tin booking
    SELECT b.*, r.rate as room_rate 
    INTO v_booking 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN RETURN NULL; END IF;

    -- A. Tiền phòng (Tạm thời lấy initial_price, sau này có thể mở rộng tính theo thời gian thực)
    v_room_charge := COALESCE(v_booking.initial_price, 0);

    -- B. Tiền dịch vụ (Tính từ jsonb services_used)
    SELECT COALESCE(SUM((item->>'total')::numeric), 0) INTO v_service_charge
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) item;

    -- C. Tiền cọc
    v_deposit := COALESCE(v_booking.deposit_amount, 0);

    -- D. Tổng cộng
    v_total_amount := v_room_charge + v_service_charge;

    RETURN jsonb_build_object(
        'booking_id', p_booking_id,
        'room_charge', v_room_charge,
        'service_charge', v_service_charge,
        'deposit_amount', v_deposit,
        'total_amount', v_total_amount,
        'amount_to_pay', v_total_amount - v_deposit
    );
END;
$$;

-- 2. CẬP NHẬT HANDLE_CHECKOUT (Bản bảo mật)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_amount_paid numeric, -- Số tiền thực trả lần này (client gửi lên)
    p_payment_method text DEFAULT 'CASH',
    p_surcharge numeric DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_total_amount numeric;
    v_room_charge numeric;
    v_service_charge numeric;
    v_new_charges numeric;
    v_staff_id uuid := COALESCE(p_staff_id, auth.uid());
    v_payment_code text;
BEGIN
    -- 1. Lấy hóa đơn từ "Pricing Brain"
    v_bill := public.calculate_booking_bill(p_booking_id);
    IF v_bill IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); 
    END IF;

    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF v_booking.status = 'completed' THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Booking đã được checkout trước đó'); 
    END IF;

    -- Chuẩn hóa dữ liệu
    v_total_amount := (v_bill->>'total_amount')::numeric + p_surcharge;
    v_room_charge := (v_bill->>'room_charge')::numeric;
    v_service_charge := (v_bill->>'service_charge')::numeric;

    -- Map payment method code
    v_payment_code := CASE 
        WHEN UPPER(p_payment_method) IN ('TRANSFER', 'CK', 'BANK_TRANSFER') THEN 'BANK_TRANSFER'
        WHEN UPPER(p_payment_method) IN ('CASH', 'TIEN_MAT') THEN 'CASH'
        WHEN UPPER(p_payment_method) IN ('CARD', 'THE') THEN 'CARD'
        ELSE 'CASH'
    END;

    -- 2. GHI NHẬN DOANH THU (REVENUE)
    -- Doanh thu phòng
    IF v_room_charge > 0 THEN
        PERFORM public.handle_ledger_entry('REVENUE', 'ROOM', v_room_charge, NULL, p_booking_id, v_booking.customer_id, 'Tiền phòng ' || v_booking.id, '{}'::jsonb, v_staff_id);
    END IF;

    -- Doanh thu dịch vụ
    IF v_service_charge > 0 THEN
        PERFORM public.handle_ledger_entry('REVENUE', 'SERVICE', v_service_charge, NULL, p_booking_id, v_booking.customer_id, 'Tiền dịch vụ ' || v_booking.id, '{}'::jsonb, v_staff_id);
    END IF;

    -- Phụ phí
    IF p_surcharge > 0 THEN
        PERFORM public.handle_ledger_entry('REVENUE', 'SURCHARGE', p_surcharge, NULL, p_booking_id, v_booking.customer_id, 'Phụ phí checkout ' || v_booking.id, '{}'::jsonb, v_staff_id);
    END IF;

    -- 3. GHI NHẬN THANH TOÁN (PAYMENT)
    IF p_amount_paid > 0 THEN
        PERFORM public.handle_ledger_entry('PAYMENT', 'ROOM_BILL', p_amount_paid, v_payment_code, p_booking_id, v_booking.customer_id, 'Thanh toán checkout ' || v_booking.id, '{}'::jsonb, v_staff_id);
    END IF;

    -- 4. CẬP NHẬT TRẠNG THÁI
    UPDATE public.bookings 
    SET 
        status = 'completed', 
        check_out_at = now(), 
        total_amount = v_total_amount, 
        final_amount = v_total_amount,
        surcharge = p_surcharge,
        payment_method = p_payment_method, 
        notes = COALESCE(p_notes, notes)
    WHERE id = p_booking_id;

    UPDATE public.rooms 
    SET 
        status = 'dirty', 
        current_booking_id = NULL, 
        last_status_change = now() 
    WHERE id = v_booking.room_id;

    -- 5. Cập nhật thống kê khách hàng
    UPDATE public.customers
    SET 
        total_spent = COALESCE(total_spent, 0) + v_total_amount,
        visit_count = COALESCE(visit_count, 0) + 1,
        last_visit = now()
    WHERE id = v_booking.customer_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Thanh toán thành công',
        'bill', v_bill,
        'surcharge', p_surcharge,
        'total_final', v_total_amount,
        'amount_paid', p_amount_paid
    );
END;
$$;
