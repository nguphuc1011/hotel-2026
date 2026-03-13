-- MIGRATION: ADD hotel_id TO customer_transactions AND ENABLE RLS
-- TRÍCH DẪN HIẾN PHÁP:
-- ĐIỀU 10 (Kỷ luật sinh tồn): Trích dẫn 2 Điều Hiến pháp trước khi hành động.
-- CHIẾN LƯỢC SAAS: Thêm hotel_id vào mọi bảng dữ liệu.

-- 1. Thêm cột hotel_id vào customer_transactions nếu chưa có
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_transactions' AND column_name = 'hotel_id') THEN
        ALTER TABLE public.customer_transactions ADD COLUMN hotel_id uuid;
    END IF;
END $$;

-- 2. Cập nhật hotel_id từ bảng customers
UPDATE public.customer_transactions ct
SET hotel_id = c.hotel_id
FROM public.customers c
WHERE ct.customer_id = c.id
AND ct.hotel_id IS NULL;

-- 3. Bật RLS cho customer_transactions
ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;

-- 4. Tạo Policy Tenant Isolation nếu chưa có
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_transactions' AND policyname = 'Tenant Isolation') THEN
        CREATE POLICY "Tenant Isolation" ON public.customer_transactions
            FOR ALL TO public
            USING (hotel_id = fn_get_tenant_id())
            WITH CHECK (hotel_id = fn_get_tenant_id());
    END IF;
END $$;
