-- TRỪ KHO TỨC THÌ (AUTO-DEDUCT) & NHẬT KÝ KHO (STOCK HISTORY)
-- Khi thêm dịch vụ vào Folio, tự động trừ kho của service tương ứng và ghi log.

-- 1. Hàm xử lý trừ kho khi cập nhật services_used trong bookings
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
BEGIN
    -- Lấy tên nhân viên thực hiện (nếu có)
    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    v_staff_name := COALESCE(v_staff_name, 'Hệ thống (Auto)');

    -- 1. Xử lý INSERT (Khi check-in có sẵn dịch vụ)
    IF (TG_OP = 'INSERT' AND NEW.services_used IS NOT NULL AND jsonb_array_length(NEW.services_used) > 0) THEN
        -- Tạo một bản ghi audit tổng cho lần check-in này
        INSERT INTO public.inventory_audits (staff_id, staff_name, notes)
        VALUES (auth.uid(), v_staff_name, 'Tự động trừ kho khi Check-in - Booking ID: ' || NEW.id)
        RETURNING id INTO v_audit_id;

        FOR v_new_service IN SELECT * FROM jsonb_array_elements(NEW.services_used) LOOP
            v_service_id := (v_new_service->>'service_id')::UUID;
            v_diff_qty := (v_new_service->>'quantity')::INTEGER;
            
            IF v_diff_qty > 0 THEN
                SELECT stock, name INTO v_stock_current, v_service_name FROM public.services WHERE id = v_service_id;
                
                -- Cập nhật kho
                UPDATE public.services SET stock = stock - v_diff_qty WHERE id = v_service_id;
                
                -- Ghi chi tiết log
                INSERT INTO public.inventory_audit_details (audit_id, service_id, service_name, system_stock, actual_stock, discrepancy)
                VALUES (v_audit_id, v_service_id, v_service_name, v_stock_current, v_stock_current - v_diff_qty, -v_diff_qty);
            END IF;
        END LOOP;

    -- 2. Xử lý UPDATE (Khi thêm/bớt dịch vụ trong Folio)
    ELSIF (TG_OP = 'UPDATE' AND (OLD.services_used IS DISTINCT FROM NEW.services_used)) THEN
        -- Tạo một bản ghi audit tổng
        INSERT INTO public.inventory_audits (staff_id, staff_name, notes)
        VALUES (auth.uid(), v_staff_name, 'Tự động cập nhật kho từ Folio - Booking ID: ' || NEW.id)
        RETURNING id INTO v_audit_id;

        -- Xử lý các món mới hoặc thay đổi số lượng
        FOR v_new_service IN SELECT * FROM jsonb_array_elements(NEW.services_used) LOOP
            v_service_id := (v_new_service->>'service_id')::UUID;
            
            -- Lấy số lượng cũ
            SELECT (val->>'quantity')::INTEGER INTO v_diff_qty 
            FROM jsonb_array_elements(COALESCE(OLD.services_used, '[]'::jsonb)) val 
            WHERE (val->>'service_id')::UUID = v_service_id;
            
            v_diff_qty := (v_new_service->>'quantity')::INTEGER - COALESCE(v_diff_qty, 0);
            
            IF v_diff_qty != 0 THEN
                SELECT stock, name INTO v_stock_current, v_service_name FROM public.services WHERE id = v_service_id;
                
                -- Cập nhật kho
                UPDATE public.services SET stock = stock - v_diff_qty WHERE id = v_service_id;
                
                -- Ghi chi tiết log
                INSERT INTO public.inventory_audit_details (audit_id, service_id, service_name, system_stock, actual_stock, discrepancy)
                VALUES (v_audit_id, v_service_id, v_service_name, v_stock_current, v_stock_current - v_diff_qty, -v_diff_qty);
            END IF;
        END LOOP;
        
        -- Xử lý các món bị xóa hoàn toàn khỏi mảng
        FOR v_old_service IN SELECT * FROM jsonb_array_elements(OLD.services_used) LOOP
            v_service_id := (v_old_service->>'service_id')::UUID;
            
            IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.services_used) val WHERE (val->>'service_id')::UUID = v_service_id) THEN
                v_diff_qty := (v_old_service->>'quantity')::INTEGER;
                SELECT stock, name INTO v_stock_current, v_service_name FROM public.services WHERE id = v_service_id;
                
                -- Cộng lại kho
                UPDATE public.services SET stock = stock + v_diff_qty WHERE id = v_service_id;
                
                -- Ghi chi tiết log
                INSERT INTO public.inventory_audit_details (audit_id, service_id, service_name, system_stock, actual_stock, discrepancy)
                VALUES (v_audit_id, v_service_id, v_service_name, v_stock_current, v_stock_current + v_diff_qty, v_diff_qty);
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Áp dụng trigger vào bảng bookings
DROP TRIGGER IF EXISTS trg_auto_deduct_inventory ON public.bookings;
CREATE TRIGGER trg_auto_deduct_inventory
    AFTER INSERT OR UPDATE OF services_used ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_deduct_inventory();

-- ==========================================
-- VIEW HÀNG ĐANG TREO (PENDING ITEMS)
-- ==========================================
CREATE OR REPLACE VIEW public.view_pending_services AS
SELECT 
    r.room_number,
    b.id as booking_id,
    b.check_in_at,
    s_used.val->>'name' as service_name,
    (s_used.val->>'quantity')::INTEGER as quantity,
    (s_used.val->>'price')::DECIMAL as price,
    (s_used.val->>'quantity')::INTEGER * (s_used.val->>'price')::DECIMAL as total_amount
FROM public.bookings b
JOIN public.rooms r ON b.room_id = r.id
CROSS JOIN LATERAL jsonb_array_elements(b.services_used) s_used(val)
WHERE b.status = 'active' AND b.deleted_at IS NULL;

-- ==========================================
-- ĐỒNG BỘ REAL-TIME (HỒ NƯỚC CHUNG)
-- ==========================================
-- Đảm bảo các bảng quan trọng đã bật Replication
ALTER TABLE public.cashflow REPLICA IDENTITY FULL;
ALTER TABLE public.services REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
