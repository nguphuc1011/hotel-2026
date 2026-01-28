-- Cập nhật Trigger xử lý tồn kho: Hỗ trợ UPDATE số lượng (tăng/giảm)
-- File: db_scripts/update_inventory_trigger_v2.sql

CREATE OR REPLACE FUNCTION public.handle_service_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE 
    v_new_stock integer;
    v_current_cost numeric;
    v_diff integer;
BEGIN
    -- 1. INSERT: Bán hàng (Trừ kho)
    IF (TG_OP = 'INSERT') THEN
        -- Lấy giá vốn hiện tại để Snapshot
        SELECT cost_price INTO v_current_cost FROM public.services WHERE id = NEW.service_id;
        
        -- Cập nhật giá vốn vào dòng booking_services vừa tạo (Snapshot)
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

    -- 2. UPDATE: Thay đổi số lượng hoặc Trạng thái (Hoàn/Hủy)
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Case A: Thay đổi số lượng (Quantity Change)
        IF (OLD.service_id = NEW.service_id AND OLD.quantity <> NEW.quantity AND NEW.status = 'active' AND OLD.status = 'active') THEN
            v_diff := OLD.quantity - NEW.quantity; -- Dương là trả bớt (tăng kho), Âm là mua thêm (giảm kho)
            
            UPDATE public.services 
            SET stock_quantity = stock_quantity + v_diff
            WHERE id = NEW.service_id AND track_inventory = true 
            RETURNING stock_quantity INTO v_new_stock;
            
            IF FOUND THEN 
                INSERT INTO public.inventory_logs (service_id, type, quantity, balance_before, balance_after, reference_id, notes) 
                VALUES (NEW.service_id, CASE WHEN v_diff > 0 THEN 'RETURN' ELSE 'SALE' END, v_diff, v_new_stock - v_diff, v_new_stock, NEW.booking_id, 'Điều chỉnh số lượng trong Folio'); 
            END IF;
        END IF;

        -- Case B: Thay đổi trạng thái (Void/Return)
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

    -- 3. DELETE: Xóa khỏi booking (Hoàn kho)
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
