-- Migration: 20260101_master_fix_pending_items_and_inventory.sql
-- Description: Sửa lỗi đồng bộ hàng treo, bật Real-time và xử lý hoàn kho khi xóa dịch vụ

-- 1. BẬT REAL-TIME CHO CÁC BẢNG QUAN TRỌNG
-- Bước này cực kỳ quan trọng để "Hàng treo" và "Sơ đồ phòng" cập nhật tức thì
BEGIN;
  -- Kiểm tra xem publication đã tồn tại chưa, nếu chưa thì tạo
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;

  -- Thêm các bảng vào publication
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cashflow;
COMMIT;

-- 2. CẬP NHẬT VIEW HÀNG TREO (view_pending_services)
-- Thêm COALESCE để tránh lỗi khi services_used là null và đảm bảo kiểu dữ liệu
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

-- 3. NÂNG CẤP TRIGGER TỰ ĐỘNG TRỪ/HOÀN KHO (fn_auto_deduct_inventory)
-- Sửa lỗi: Khi xóa một dịch vụ khỏi Folio, kho phải được cộng lại (hoàn kho)
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
    -- Lấy tên nhân viên thực hiện
    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    v_staff_name := COALESCE(v_staff_name, 'Hệ thống (Auto)');

    -- Chỉ xử lý khi có sự thay đổi trong services_used
    IF (TG_OP = 'UPDATE' AND (OLD.services_used IS DISTINCT FROM NEW.services_used)) THEN
        
        -- Tạo một bản ghi audit tổng
        INSERT INTO public.inventory_audits (staff_id, staff_name, notes)
        VALUES (auth.uid(), v_staff_name, 'Tự động cập nhật kho từ Folio - Booking ID: ' || NEW.id)
        RETURNING id INTO v_audit_id;

        -- A. Xử lý các mục mới hoặc thay đổi số lượng (Tăng/Giảm)
        FOR v_new_service IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.services_used, '[]'::jsonb)) LOOP
            v_service_id := (v_new_service->>'service_id')::UUID;
            
            -- Tìm số lượng cũ
            SELECT (val->>'quantity')::INTEGER INTO v_diff_qty 
            FROM jsonb_array_elements(COALESCE(OLD.services_used, '[]'::jsonb)) val 
            WHERE (val->>'service_id')::UUID = v_service_id;

            -- Tính chênh lệch: (Mới - Cũ)
            -- Nếu mới > cũ -> diff dương (cần trừ kho thêm)
            -- Nếu mới < cũ -> diff âm (cần hoàn kho)
            v_diff_qty := (v_new_service->>'quantity')::INTEGER - COALESCE(v_diff_qty, 0);

            IF v_diff_qty != 0 THEN
                -- Cập nhật kho
                SELECT stock, name INTO v_stock_current, v_service_name FROM public.services WHERE id = v_service_id;
                
                UPDATE public.services 
                SET stock = stock - v_diff_qty 
                WHERE id = v_service_id;

                -- Ghi log chi tiết
                INSERT INTO public.inventory_audit_details (audit_id, service_id, service_name, system_stock, actual_stock, discrepancy)
                VALUES (v_audit_id, v_service_id, v_service_name, v_stock_current, v_stock_current - v_diff_qty, -v_diff_qty);
            END IF;
        END LOOP;

        -- B. Xử lý các mục bị XÓA HOÀN TOÀN khỏi mảng services_used
        FOR v_old_service IN SELECT * FROM jsonb_array_elements(COALESCE(OLD.services_used, '[]'::jsonb)) LOOP
            v_service_id := (v_old_service->>'service_id')::UUID;
            
            -- Kiểm tra xem ID này còn tồn tại trong mảng mới không
            IF NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.services_used, '[]'::jsonb)) val 
                WHERE (val->>'service_id')::UUID = v_service_id
            ) THEN
                -- Nếu không còn -> Phải hoàn lại toàn bộ số lượng cũ vào kho
                v_diff_qty := (v_old_service->>'quantity')::INTEGER;
                
                SELECT stock, name INTO v_stock_current, v_service_name FROM public.services WHERE id = v_service_id;
                
                UPDATE public.services 
                SET stock = stock + v_diff_qty 
                WHERE id = v_service_id;

                -- Ghi log chi tiết (Discrepancy dương vì là hoàn kho)
                INSERT INTO public.inventory_audit_details (audit_id, service_id, service_name, system_stock, actual_stock, discrepancy)
                VALUES (v_audit_id, v_service_id, v_service_name, v_stock_current, v_stock_current + v_diff_qty, v_diff_qty);
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
