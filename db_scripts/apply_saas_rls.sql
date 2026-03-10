-- APPLY SAAS ISOLATION POLICIES
CREATE OR REPLACE FUNCTION public.fn_get_my_hotel_id() RETURNS UUID AS $$
    SELECT hotel_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

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
        -- Xóa các policy cũ có thể gây xung đột
        EXECUTE format('DROP POLICY IF EXISTS "SaaS Isolation Policy" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Allow All Access" ON public.%I', t_name);
        
        -- Kích hoạt RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t_name);

        -- Tạo policy mới: Chỉ cho phép truy cập dữ liệu thuộc hotel_id của mình
        EXECUTE format('CREATE POLICY "SaaS Isolation Policy" ON public.%I 
                        FOR ALL TO authenticated 
                        USING (hotel_id = public.fn_get_my_hotel_id())
                        WITH CHECK (hotel_id = public.fn_get_my_hotel_id())', t_name);
    END LOOP;
END $$;
