-- Migration: 20260101_sync_resolve_checkout_revenue.sql
-- Description: Cập nhật resolve_checkout để ghi nhận doanh thu vào cashflow, đồng bộ với process_checkout_transaction.

DROP FUNCTION IF EXISTS public.resolve_checkout(uuid, text, numeric, numeric, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.resolve_checkout(
    p_booking_id UUID,
    p_payment_method TEXT,
    p_total_amount NUMERIC,
    p_final_amount NUMERIC,
    p_surcharge NUMERIC,
    p_notes TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room_id UUID;
    v_customer_id UUID;
    v_current_status TEXT;
    v_room_number TEXT;
    v_category_id UUID;
    v_category_name TEXT := 'Tiền phòng (Room)';
    v_staff_name TEXT;
BEGIN
    -- 1. Lấy thông tin booking và phòng
    SELECT b.room_id, b.customer_id, b.status, r.room_number 
    INTO v_room_id, v_customer_id, v_current_status, v_room_number
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;

    -- Lấy tên nhân viên thực hiện
    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    IF v_staff_name IS NULL THEN
        v_staff_name := 'Hệ thống (Checkout)';
    END IF;

    IF v_current_status IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy thông tin đặt phòng');
    END IF;

    IF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng này đã được thanh toán trước đó');
    END IF;

    -- 2. Cập nhật trạng thái Booking
    UPDATE public.bookings
    SET 
        status = 'completed',
        check_out_at = NOW(),
        total_amount = p_total_amount,
        final_amount = p_final_amount,
        surcharge = p_surcharge,
        payment_method = p_payment_method,
        notes = p_notes
    WHERE id = p_booking_id;

    -- 3. Cập nhật trạng thái Phòng sang 'dirty'
    UPDATE public.rooms
    SET status = 'dirty', current_booking_id = NULL, last_status_change = NOW()
    WHERE id = v_room_id;

    -- 4. Cập nhật thống kê khách hàng
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + p_final_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW()
        WHERE id = v_customer_id;
    END IF;

    -- 5. Ghi nhận vào bảng cashflow (Dòng tiền)
    -- Tìm category_id cho "Tiền phòng (Room)"
    SELECT id INTO v_category_id 
    FROM public.cashflow_categories 
    WHERE name = v_category_name AND type = 'income' 
    LIMIT 1;

    -- Nếu không tìm thấy thì lấy category đầu tiên có type = 'income'
    IF v_category_id IS NULL THEN
        SELECT id INTO v_category_id 
        FROM public.cashflow_categories 
        WHERE type = 'income' 
        LIMIT 1;
    END IF;

    -- Thực hiện ghi nhận dòng tiền
    IF v_category_id IS NOT NULL THEN
        INSERT INTO public.cashflow (
            type,
            category,
            category_id,
            category_name,
            content,
            amount,
            payment_method,
            created_by,
            created_by_id,
            created_at
        ) VALUES (
            'income',
            v_category_name,
            v_category_id,
            v_category_name,
            'Thanh toán tiền phòng ' || v_room_number,
            p_final_amount,
            p_payment_method,
            v_staff_name,
            auth.uid(),
            NOW()
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Thanh toán và ghi nhận doanh thu thành công');

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload config';
