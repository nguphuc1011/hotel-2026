-- MIGRATION: 20260101_final_checkout_signature_fix.sql
-- Description: Đảm bảo hàm handle_checkout có signature duy nhất, đúng tham số và đủ quyền EXECUTE.
-- Mục tiêu: Giải quyết triệt để lỗi "Could not find function public.handle_checkout"

-- 1. BỔ SUNG CỘT THIẾU CHO BẢNG BOOKINGS (SCHEMA SYNC)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='room_charge_actual') THEN
        ALTER TABLE public.bookings ADD COLUMN room_charge_actual NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='service_charge_actual') THEN
        ALTER TABLE public.bookings ADD COLUMN service_charge_actual NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='final_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN final_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='total_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN total_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='surcharge') THEN
        ALTER TABLE public.bookings ADD COLUMN surcharge NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='payment_method') THEN
        ALTER TABLE public.bookings ADD COLUMN payment_method TEXT;
    END IF;
END $$;

-- 2. XÓA BỎ TẤT CẢ CÁC PHIÊN BẢN CŨ ĐỂ TRÁNH XUNG ĐỘT (OVERLOADING)
DO $$ 
DECLARE 
    func_name text;
BEGIN
    FOR func_name IN (
        SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'handle_checkout' AND n.nspname = 'public'
    ) LOOP
        EXECUTE 'DROP FUNCTION ' || func_name;
    END LOOP;
END $$;

-- 3. TẠO LẠI HÀM VỚI THAM SỐ CỐ ĐỊNH (SẮP XẾP ALPHABET ĐỂ POSTGREST DỄ NHẬN DIỆN)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_notes text,
    p_payment_method text,
    p_surcharge numeric,
    p_total_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking record;
    v_room record;
    v_checkout_details json;
    v_final_total_amount numeric;
    v_final_surcharge numeric;
    v_room_charge numeric := 0;
    v_service_charge numeric := 0;
    v_category_id uuid;
    v_category_name text := 'Tiền phòng (Room)';
    v_staff_name text;
    v_service_item jsonb;
BEGIN
    -- A. Lấy thông tin booking và phòng
    SELECT b.*, r.room_number INTO v_booking 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy thông tin đặt phòng');
    END IF;

    -- Kiểm tra nếu đã thanh toán rồi
    IF v_booking.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Phòng này đã được thanh toán trước đó');
    END IF;

    -- B. Xác định số tiền
    v_final_total_amount := COALESCE(p_total_amount, 0);
    v_final_surcharge := COALESCE(p_surcharge, 0);
    
    -- Cố gắng tính toán room charge để lưu nội bộ (nếu cần)
    BEGIN
        v_checkout_details := public.get_checkout_details(p_booking_id);
        IF (v_checkout_details->>'error') IS NULL THEN
            v_room_charge := (v_checkout_details->>'room_charge')::numeric;
        ELSE
            v_room_charge := v_final_total_amount;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_room_charge := v_final_total_amount; -- Fallback
    END;

    v_service_charge := v_final_total_amount - v_room_charge - v_final_surcharge;

    -- C. Cập nhật trạng thái Booking
    UPDATE public.bookings
    SET 
        status = 'completed',
        check_out_at = now(),
        total_amount = v_final_total_amount,
        final_amount = v_final_total_amount,
        surcharge = v_final_surcharge,
        room_charge_actual = v_room_charge,
        service_charge_actual = v_service_charge,
        payment_method = p_payment_method,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_booking_id;

    -- D. Cập nhật trạng thái Phòng thành 'dirty' (cần dọn)
    UPDATE public.rooms
    SET 
        status = 'dirty',
        current_booking_id = NULL,
        last_status_change = now()
    WHERE id = v_booking.room_id;

    -- E. Tạo hóa đơn (Invoices)
    INSERT INTO public.invoices (
        booking_id, 
        customer_id, 
        room_id, 
        total_amount, 
        payment_method, 
        created_at
    )
    VALUES (
        p_booking_id,
        v_booking.customer_id,
        v_booking.room_id,
        v_final_total_amount,
        p_payment_method,
        now()
    );

    -- F. Cập nhật tổng chi tiêu khách hàng
    IF v_booking.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + v_final_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW()
        WHERE id = v_booking.customer_id;
    END IF;

    -- G. Ghi nhận dòng tiền (Cashflow)
    -- Lấy tên nhân viên thực hiện
    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    IF v_staff_name IS NULL THEN
        v_staff_name := 'Hệ thống (Checkout)';
    END IF;

    -- Lấy category_id cho "Tiền phòng"
    SELECT id INTO v_category_id 
    FROM public.cashflow_categories 
    WHERE name = v_category_name AND type = 'income' 
    LIMIT 1;

    IF v_category_id IS NULL THEN
        SELECT id INTO v_category_id 
        FROM public.cashflow_categories 
        WHERE type = 'income' 
        LIMIT 1;
    END IF;

    IF v_category_id IS NOT NULL THEN
        INSERT INTO public.cashflow (
            type, category, category_id, category_name, content, 
            amount, payment_method, created_by, created_by_id, created_at
        ) VALUES (
            'income', v_category_name, v_category_id, v_category_name, 
            'Thanh toán phòng ' || v_booking.room_number,
            v_final_total_amount, p_payment_method, v_staff_name, auth.uid(), NOW()
        );
    END IF;

    -- H. Trừ kho dịch vụ (Deduct Stock)
    FOR v_service_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb))
    LOOP
        IF (v_service_item->>'id') IS NOT NULL AND (v_service_item->>'quantity') IS NOT NULL THEN
            UPDATE public.services
            SET stock = COALESCE(stock, 0) - (v_service_item->>'quantity')::numeric
            WHERE id = (v_service_item->>'id')::uuid;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Thanh toán hoàn tất',
        'total_amount', v_final_total_amount
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;

-- 4. CẤP QUYỀN EXECUTE (QUAN TRỌNG NHẤT)
GRANT EXECUTE ON FUNCTION public.handle_checkout TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_checkout TO anon;
GRANT EXECUTE ON FUNCTION public.handle_checkout TO service_role;

-- 5. RELOAD POSTGREST CACHE
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
