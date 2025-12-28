-- 1. Bảng danh mục dịch vụ
CREATE TABLE IF NOT EXISTS public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng dịch vụ
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Cái',
  price NUMERIC NOT NULL DEFAULT 0,
  stock NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  icon TEXT,
  tax_type TEXT CHECK (tax_type IN ('service', 'accommodation', 'goods')) DEFAULT 'service',
  keywords TEXT[] DEFAULT '{}',
  service_category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bảng lịch sử kho
CREATE TABLE IF NOT EXISTS public.stock_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  action_type TEXT CHECK (action_type IN ('IMPORT', 'EXPORT')),
  quantity NUMERIC NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bật RLS cho tất cả các bảng
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;

-- Tạo chính sách (Policies) - Cho phép mọi thao tác cho user đã login (giả định admin đơn giản)
CREATE POLICY "Enable all for authenticated" ON public.service_categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated" ON public.services FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated" ON public.stock_history FOR ALL TO authenticated USING (true);

-- Dữ liệu mẫu
INSERT INTO public.service_categories (name) VALUES ('Đồ uống'), ('Thức ăn'), ('Khác') 
ON CONFLICT DO NOTHING;
