
INSERT INTO public.settings_security (key, description, is_enabled, category)
VALUES ('finance_create_income', 'Tạo phiếu thu khác (Ngoài hóa đơn)', false, 'finance')
ON CONFLICT (key) DO NOTHING;
