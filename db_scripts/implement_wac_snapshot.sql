-- 1. Bổ sung cột Snapshot Giá vốn vào bảng Booking Services
ALTER TABLE public.booking_services
ADD COLUMN IF NOT EXISTS cost_price_at_time numeric DEFAULT 0;

-- 2. Bổ sung Ràng buộc Chặn âm kho vào bảng Services
ALTER TABLE public.services
DROP CONSTRAINT IF EXISTS services_stock_quantity_check;

ALTER TABLE public.services
ADD CONSTRAINT services_stock_quantity_check 
CHECK (stock_quantity >= 0);

-- 3. Cập nhật Trigger tự động ghi giá vốn (Snapshot) khi bán hàng
CREATE OR REPLACE FUNCTION public.handle_service_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE 
    v_new_stock integer;
    v_current_cost numeric;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Lấy giá vốn hiện tại để Snapshot
        SELECT cost_price INTO v_current_cost FROM public.services WHERE id = NEW.service_id;
        
        -- Cập nhật giá vốn vào dòng booking_services vừa tạo (Snapshot)
        -- Lưu ý: Phải update lại chính dòng NEW vì Trigger AFTER INSERT không sửa được NEW trực tiếp
        UPDATE public.booking_services 
        SET cost_price_at_time = COALESCE(v_current_cost, 0)
        WHERE id = NEW.id;

        -- Trừ kho
        UPDATE public.services 
        SET stock_quantity = stock_quantity - NEW.quantity 
        WHERE id = NEW.service_id AND track_inventory = true 
        RETURNING stock_quantity INTO v_new_stock;
        
        IF FOUND THEN 
            INSERT INTO public.inventory_logs (service_id, type, quantity, balance_before, balance_after, reference_id, notes) 
            VALUES (NEW.service_id, 'SALE', -NEW.quantity, v_new_stock + NEW.quantity, v_new_stock, NEW.booking_id, 'Xuất bán cho phòng'); 
        END IF;

    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status = 'active' AND (NEW.status = 'returned' OR NEW.status = 'voided')) THEN
            UPDATE public.services 
            SET stock_quantity = stock_quantity + OLD.quantity 
            WHERE id = OLD.service_id AND track_inventory = true 
            RETURNING stock_quantity INTO v_new_stock;
            
            IF FOUND THEN 
                INSERT INTO public.inventory_logs (service_id, type, quantity, balance_before, balance_after, reference_id, notes) 
                VALUES (OLD.service_id, 'RETURN', OLD.quantity, v_new_stock - OLD.quantity, v_new_stock, OLD.booking_id, 'Hoàn kho do ' || CASE WHEN NEW.status = 'returned' THEN 'khách trả' ELSE 'hủy món' END); 
            END IF;
        END IF;

    ELSIF (TG_OP = 'DELETE') THEN
         IF OLD.status = 'active' THEN
            UPDATE public.services 
            SET stock_quantity = stock_quantity + OLD.quantity 
            WHERE id = OLD.service_id AND track_inventory = true 
            RETURNING stock_quantity INTO v_new_stock;
            
            IF FOUND THEN 
                INSERT INTO public.inventory_logs (service_id, type, quantity, balance_before, balance_after, reference_id, notes) 
                VALUES (OLD.service_id, 'RETURN', OLD.quantity, v_new_stock - OLD.quantity, v_new_stock, OLD.booking_id, 'Hoàn kho do xóa khỏi phòng'); 
            END IF;
         END IF;
         RETURN OLD;
    END IF;
    RETURN NULL;
END; 
$function$;

-- 4. Dọn dẹp các hàm rác không dùng đến
DROP FUNCTION IF EXISTS public.adjust_inventory(uuid, integer, text); -- Xóa bản cũ 3 tham số
DROP FUNCTION IF EXISTS public.check_inventory_before_sale(); -- Xóa zombie function
