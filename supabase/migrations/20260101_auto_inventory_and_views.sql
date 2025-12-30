-- TRỪ KHO TỨC THÌ (AUTO-DEDUCT)
-- Khi thêm dịch vụ vào Folio, tự động trừ kho của service tương ứng.

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
BEGIN
    -- Chỉ xử lý nếu services_used thay đổi
    IF (OLD.services_used IS DISTINCT FROM NEW.services_used) THEN
        
        -- Duyệt qua mảng dịch vụ mới để trừ kho (hoặc cộng lại nếu giảm số lượng)
        -- Tâu Bệ Hạ: Ta so sánh từng món trong mảng JSONB
        
        -- 1. Xử lý các món mới hoặc tăng số lượng
        FOR v_new_service IN SELECT * FROM jsonb_array_elements(NEW.services_used) LOOP
            v_service_id := (v_new_service->>'service_id')::UUID;
            
            -- Lấy số lượng cũ (nếu có)
            SELECT (val->>'quantity')::INTEGER INTO v_diff_qty 
            FROM jsonb_array_elements(COALESCE(OLD.services_used, '[]'::jsonb)) val 
            WHERE (val->>'service_id')::UUID = v_service_id;
            
            v_diff_qty := (v_new_service->>'quantity')::INTEGER - COALESCE(v_diff_qty, 0);
            
            IF v_diff_qty > 0 THEN
                -- Kiểm tra kho
                SELECT stock, name INTO v_stock_current, v_service_name FROM public.services WHERE id = v_service_id;
                
                IF v_stock_current < v_diff_qty THEN
                    RAISE EXCEPTION 'KHO KHÔNG ĐỦ: Món [%] chỉ còn %, không thể xuất %!', v_service_name, v_stock_current, v_diff_qty;
                END IF;
                
                -- Trừ kho
                UPDATE public.services SET stock = stock - v_diff_qty WHERE id = v_service_id;
            ELSIF v_diff_qty < 0 THEN
                -- Cộng lại kho nếu giảm số lượng
                UPDATE public.services SET stock = stock + ABS(v_diff_qty) WHERE id = v_service_id;
            END IF;
        END LOOP;
        
        -- 2. Xử lý các món bị xóa hoàn toàn khỏi mảng
        FOR v_old_service IN SELECT * FROM jsonb_array_elements(OLD.services_used) LOOP
            v_service_id := (v_old_service->>'service_id')::UUID;
            
            IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.services_used) val WHERE (val->>'service_id')::UUID = v_service_id) THEN
                -- Cộng lại kho toàn bộ số lượng đã dùng
                UPDATE public.services SET stock = stock + (v_old_service->>'quantity')::INTEGER WHERE id = v_service_id;
            END IF;
        END LOOP;

    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Áp dụng trigger vào bảng bookings
DROP TRIGGER IF EXISTS trg_auto_deduct_inventory ON public.bookings;
CREATE TRIGGER trg_auto_deduct_inventory
    BEFORE UPDATE OF services_used ON public.bookings
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
WHERE b.status = 'occupied' AND b.deleted_at IS NULL;

-- ==========================================
-- ĐỒNG BỘ REAL-TIME (HỒ NƯỚC CHUNG)
-- ==========================================
-- Đảm bảo các bảng quan trọng đã bật Replication
ALTER TABLE public.cashflow REPLICA IDENTITY FULL;
ALTER TABLE public.services REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
