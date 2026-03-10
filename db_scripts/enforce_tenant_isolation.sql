-- 1. HÀM HELPER ĐỂ LẤY HOTEL_ID TỪ CUSTOM HEADER
-- Khi Frontend gửi request, nó sẽ đính kèm header 'x-hotel-id'
CREATE OR REPLACE FUNCTION public.fn_get_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('request.headers', true)::json->>'x-hotel-id', '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. RESET VÀ ÁP DỤNG RLS CHO TOÀN BỘ BẢNG QUAN TRỌNG
DO $$ 
DECLARE 
    t_name TEXT;
BEGIN 
    FOR t_name IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'rooms', 'room_categories', 'bookings', 'booking_services', 
            'customers', 'cash_flow', 'wallets', 'external_payables', 
            'staff', 'role_permissions', 'services', 'cash_flow_categories', 
            'settings', 'audit_logs', 'inventory_logs'
        )
    LOOP 
        -- Xóa TẤT CẢ các policy cũ (bao gồm các policy "Allow all" gây lộ dữ liệu)
        EXECUTE format('DROP POLICY IF EXISTS "SaaS Isolation Policy" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Allow All Access" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Enable all access for all users" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "wallets_read_policy" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "finance_read_policy" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "audit_read_policy" ON public.%I', t_name);
        
        -- Kích hoạt RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t_name);

        -- Tạo policy "Vạn lý trường thành": Chỉ thấy dữ liệu của Hotel mình
        -- Dùng fn_get_tenant_id() để lấy ID từ Header do Frontend gửi lên
        EXECUTE format('CREATE POLICY "Tenant Isolation" ON public.%I 
                        FOR ALL 
                        TO anon, authenticated 
                        USING (hotel_id = public.fn_get_tenant_id())
                        WITH CHECK (hotel_id = public.fn_get_tenant_id())', t_name);
    END LOOP;
END $$;

-- 3. ĐẶC CÁCH CHO BẢNG HOTELS VÀ STAFF ĐỂ PHỤC VỤ LOGIN
-- Bảng hotels: Cho phép đọc slug và id để login
DROP POLICY IF EXISTS "Hotels Public Read" ON public.hotels;
CREATE POLICY "Hotels Public Read" ON public.hotels FOR SELECT TO anon, authenticated USING (true);

-- Bảng staff: Cho phép login (SELECT) bằng username mà không cần hotel_id header trước
-- (Vì lúc chưa login thì làm gì đã có hotel_id)
DROP POLICY IF EXISTS "Staff Login Access" ON public.staff;
CREATE POLICY "Staff Login Access" ON public.staff FOR SELECT TO anon, authenticated USING (true);
