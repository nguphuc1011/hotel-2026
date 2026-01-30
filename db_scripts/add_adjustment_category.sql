
-- Create category 'Điều chỉnh số dư' for Wallet Adjustment
-- This category is NOT revenue, it is just for balancing the wallet.

INSERT INTO public.cash_flow_categories (name, type, description, is_revenue, is_system, is_active)
SELECT 'Điều chỉnh số dư', 'IN', 'Điều chỉnh tăng số dư ví', false, true, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.cash_flow_categories WHERE name = 'Điều chỉnh số dư' AND type = 'IN'
);

INSERT INTO public.cash_flow_categories (name, type, description, is_revenue, is_system, is_active)
SELECT 'Điều chỉnh số dư', 'OUT', 'Điều chỉnh giảm số dư ví', false, true, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.cash_flow_categories WHERE name = 'Điều chỉnh số dư' AND type = 'OUT'
);
