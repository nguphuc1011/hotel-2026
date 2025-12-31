-- Migration: Script SQL chuẩn hóa thanh toán và hàng treo
-- Đảm bảo trừ kho khi check-in, cập nhật hàng treo thời gian thực và thanh toán sạch sẽ.

-- 0. Tạo bảng Audit (Không dùng FK tới auth.users để tránh lỗi quyền hạn)
CREATE TABLE IF NOT EXISTS public.inventory_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    staff_id UUID,
    staff_name TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS public.inventory_audit_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES public.inventory_audits(id) ON DELETE CASCADE,
    service_id UUID,
    service_name TEXT,
    system_stock INTEGER,
    actual_stock INTEGER,
    discrepancy INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1. Cập nhật Trigger trừ kho (Xử lý cả INSERT và UPDATE)
CREATE OR REPLACE FUNCTION public.fn_auto_deduct_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_old_service JSONB;
    v_new_service JSONB;
    v_service_id UUID;
    v_diff_qty INTEGER;
    v_stock_current INTEGER;
    v_service_name TEXT;
    v_audit_id UUID;
    v_staff_name TEXT;
    v_user_id UUID;
BEGIN
    -- Lấy ID người dùng an toàn
    BEGIN
        v_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    -- Lấy tên nhân viên thực hiện
    IF v_user_id IS NOT NULL THEN
        SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = v_user_id;
    END IF;
    v_staff_name := COALESCE(v_staff_name, 'Hệ thống (Auto)');

    -- TRƯỜNG HỢP 1: THÊM MỚI BOOKING (Check-in có sẵn dịch vụ)
    IF (TG_OP = 'INSERT' AND NEW.services_used IS NOT NULL AND jsonb_array_length(NEW.services_used) > 0) THEN
        INSERT INTO public.inventory_audits (staff_id, staff_name, notes)
        VALUES (v_user_id, v_staff_name, 'Trừ kho khi Check-in - Booking: ' || NEW.id)
        RETURNING id INTO v_audit_id;

        FOR v_new_service IN SELECT * FROM jsonb_array_elements(NEW.services_used) LOOP
            v_service_id := (v_new_service->>'service_id')::UUID;
            v_diff_qty := (v_new_service->>'quantity')::INTEGER;
            
            IF v_diff_qty > 0 THEN
                SELECT stock, name INTO v_stock_current, v_service_name FROM public.services WHERE id = v_service_id;
                IF v_service_id IS NOT NULL THEN
                    UPDATE public.services SET stock = stock - v_diff_qty WHERE id = v_service_id;
                    INSERT INTO public.inventory_audit_details (audit_id, service_id, service_name, system_stock, actual_stock, discrepancy)
                    VALUES (v_audit_id, v_service_id, v_service_name, v_stock_current, v_stock_current - v_diff_qty, -v_diff_qty);
                END IF;
            END IF;
        END LOOP;

    -- TRƯỜNG HỢP 2: CẬP NHẬT FOLIO (Thêm/Bớt/Xóa dịch vụ)
    ELSIF (TG_OP = 'UPDATE' AND (COALESCE(OLD.services_used, '[]'::jsonb) IS DISTINCT FROM COALESCE(NEW.services_used, '[]'::jsonb))) THEN
        -- Chỉ tạo audit nếu thực sự có thay đổi số lượng
        INSERT INTO public.inventory_audits (staff_id, staff_name, notes)
        VALUES (v_user_id, v_staff_name, 'Cập nhật kho từ Folio - Booking: ' || NEW.id)
        RETURNING id INTO v_audit_id;

        -- A. Xử lý tăng/giảm số lượng hoặc thêm món mới
        FOR v_new_service IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.services_used, '[]'::jsonb)) LOOP
            v_service_id := (v_new_service->>'service_id')::UUID;
            
            -- Tìm số lượng cũ của service này
            v_diff_qty := 0;
            SELECT (val->>'quantity')::INTEGER INTO v_diff_qty 
            FROM jsonb_array_elements(COALESCE(OLD.services_used, '[]'::jsonb)) val 
            WHERE (val->>'service_id')::UUID = v_service_id;

            -- Tính chênh lệch (Mới - Cũ)
            v_diff_qty := (v_new_service->>'quantity')::INTEGER - COALESCE(v_diff_qty, 0);

            IF v_diff_qty != 0 THEN
                SELECT stock, name INTO v_stock_current, v_service_name FROM public.services WHERE id = v_service_id;
                IF v_service_id IS NOT NULL THEN
                    UPDATE public.services SET stock = stock - v_diff_qty WHERE id = v_service_id;
                    INSERT INTO public.inventory_audit_details (audit_id, service_id, service_name, system_stock, actual_stock, discrepancy)
                    VALUES (v_audit_id, v_service_id, v_service_name, v_stock_current, v_stock_current - v_diff_qty, -v_diff_qty);
                END IF;
            END IF;
        END LOOP;

        -- B. Xử lý xóa hoàn toàn dịch vụ khỏi danh sách
        FOR v_old_service IN SELECT * FROM jsonb_array_elements(COALESCE(OLD.services_used, '[]'::jsonb)) LOOP
            v_service_id := (v_old_service->>'service_id')::UUID;
            -- Nếu ID cũ không còn trong mảng mới
            IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.services_used, '[]'::jsonb)) val WHERE (val->>'service_id')::UUID = v_service_id) THEN
                v_diff_qty := (v_old_service->>'quantity')::INTEGER;
                SELECT stock, name INTO v_stock_current, v_service_name FROM public.services WHERE id = v_service_id;
                IF v_service_id IS NOT NULL THEN
                    UPDATE public.services SET stock = stock + v_diff_qty WHERE id = v_service_id;
                    INSERT INTO public.inventory_audit_details (audit_id, service_id, service_name, system_stock, actual_stock, discrepancy)
                    VALUES (v_audit_id, v_service_id, v_service_name, v_stock_current, v_stock_current + v_diff_qty, v_diff_qty);
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1.1 Áp dụng trigger vào bảng bookings
DROP TRIGGER IF EXISTS trg_auto_deduct_inventory ON public.bookings;
CREATE TRIGGER trg_auto_deduct_inventory
    AFTER INSERT OR UPDATE OF services_used ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_deduct_inventory();

-- 2. Cập nhật View hàng treo
CREATE OR REPLACE VIEW public.view_pending_services AS
SELECT 
    r.room_number,
    b.id as booking_id,
    b.check_in_at,
    s_used.val->>'name' as service_name,
    COALESCE((s_used.val->>'quantity')::INTEGER, 0) as quantity,
    COALESCE((s_used.val->>'price')::DECIMAL, 0) as price,
    COALESCE((s_used.val->>'quantity')::INTEGER, 0) * COALESCE((s_used.val->>'price')::DECIMAL, 0) as total_amount
FROM public.bookings b
JOIN public.rooms r ON b.room_id = r.id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.services_used, '[]'::jsonb)) s_used(val)
WHERE b.status = 'active' AND b.deleted_at IS NULL;

-- 3. Cập nhật RPC Thanh toán (Gom về một mối)
CREATE OR REPLACE FUNCTION public.process_checkout_transaction(
    p_booking_id UUID,
    p_payment_method TEXT,
    p_surcharge NUMERIC,
    p_total_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room_id UUID;
    v_customer_id UUID;
    v_current_status TEXT;
BEGIN
    -- Lấy thông tin
    SELECT room_id, customer_id, status INTO v_room_id, v_customer_id, v_current_status
    FROM public.bookings WHERE id = p_booking_id;

    IF v_current_status IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    IF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Đã thanh toán trước đó');
    END IF;

    -- A. Chốt Booking
    UPDATE public.bookings
    SET 
        status = 'completed',
        check_out_at = NOW(),
        surcharge = p_surcharge,
        total_amount = p_total_amount,
        final_amount = p_total_amount,
        payment_method = p_payment_method
    WHERE id = p_booking_id;

    -- B. Ghi Hóa đơn
    INSERT INTO public.invoices (
        booking_id,
        customer_id,
        room_id,
        total_amount,
        payment_method,
        created_at
    ) VALUES (
        p_booking_id,
        v_customer_id,
        v_room_id,
        p_total_amount,
        p_payment_method,
        NOW()
    );

    -- C. Giải phóng phòng
    UPDATE public.rooms
    SET 
        status = 'dirty',
        current_booking_id = NULL,
        last_status_change = NOW()
    WHERE id = v_room_id;

    -- D. Cập nhật khách hàng (Tích lũy)
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + p_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW()
        WHERE id = v_customer_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Thanh toán thành công');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 4. Reload PostgREST Cache
NOTIFY pgrst, 'reload config';
