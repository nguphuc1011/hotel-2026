-- Fix Cash Flow Categories Symmetry across both hotels
-- Safely inserts using WHERE NOT EXISTS

DO $$
DECLARE
    v_def_id uuid := '33e31139-346d-4332-8b0f-5316019cba8c';
    v_ct_id uuid := 'f6020952-a268-4086-8f17-f65d27d5f042';
    r record;
BEGIN
    -- 1. Insert missing categories for default hotel
    FOR r IN (
        SELECT * FROM (VALUES
            ('NHAP_HANG', 'OUT', false),
            ('Chi vận hành', 'OUT', false),
            ('Doanh thu bổ sung', 'IN', true),
            ('Hoàn tiền', 'OUT', false),
            ('Hoàn tiền hủy phòng', 'OUT', false),
            ('Phạt hủy phòng', 'IN', true),
            ('Thanh toán tiền phòng', 'IN', false),
            ('Thanh toán trả phòng', 'IN', false),
            ('Thanh toán dịch vụ', 'OUT', false),
            ('Thu khác', 'IN', true),
            ('Thu nợ', 'IN', false),
            ('Thu trước', 'IN', false),
            ('Trả nợ', 'OUT', false)
        ) AS t(name, type, is_revenue)
    ) LOOP
        IF NOT EXISTS (SELECT 1 FROM public.cash_flow_categories WHERE hotel_id = v_def_id AND name = r.name) THEN
            INSERT INTO public.cash_flow_categories (hotel_id, name, type, is_revenue)
            VALUES (v_def_id, r.name, r.type, r.is_revenue);
        END IF;
    END LOOP;

    -- 2. Insert missing categories for Cát Tường hotel
    FOR r IN (
        SELECT * FROM (VALUES
            ('Nhập hàng', 'OUT', false),
            ('Doanh thu bổ sung', 'IN', true),
            ('Hoàn tiền', 'OUT', false),
            ('Hoàn tiền hủy phòng', 'OUT', false),
            ('Phạt hủy phòng', 'IN', true),
            ('Thu trước', 'IN', false),
            ('Bảo trì', 'OUT', false),
            ('Điện nước', 'OUT', false),
            ('Phụ thu', 'IN', true),
            ('Điều chỉnh', 'IN', false),
            ('Khác', 'IN', true),
            ('Khác', 'OUT', false)
        ) AS t(name, type, is_revenue)
    ) LOOP
        IF NOT EXISTS (SELECT 1 FROM public.cash_flow_categories WHERE hotel_id = v_ct_id AND name = r.name) THEN
            INSERT INTO public.cash_flow_categories (hotel_id, name, type, is_revenue)
            VALUES (v_ct_id, r.name, r.type, r.is_revenue);
        END IF;
    END LOOP;

    -- 3. Fix Customer initial balance symmetry for Anh Hùng and Test Customer Sync V2
    -- Anh Hùng: balance 50,000 -> add initial balance transaction
    IF EXISTS (SELECT 1 FROM customers WHERE id = '1cbaebb8-9824-4901-92db-a5ccb6b8cfcb' AND balance = 50000) THEN
        IF NOT EXISTS (SELECT 1 FROM customer_transactions WHERE customer_id = '1cbaebb8-9824-4901-92db-a5ccb6b8cfcb') THEN
            INSERT INTO public.customer_transactions (
                customer_id, type, amount, balance_before, balance_after, description, hotel_id
            ) VALUES (
                '1cbaebb8-9824-4901-92db-a5ccb6b8cfcb', 'payment', 50000, 0, 50000, 'Số dư ban đầu', v_def_id
            );
        END IF;
    END IF;

    -- Test Customer Sync V2: balance 50,000 -> add initial balance transaction
    IF EXISTS (SELECT 1 FROM customers WHERE id = '014a5ed6-1a44-407c-830c-7e92effce8f4' AND balance = 50000) THEN
        IF NOT EXISTS (SELECT 1 FROM customer_transactions WHERE customer_id = '014a5ed6-1a44-407c-830c-7e92effce8f4') THEN
            INSERT INTO public.customer_transactions (
                customer_id, type, amount, balance_before, balance_after, description, hotel_id
            ) VALUES (
                '014a5ed6-1a44-407c-830c-7e92effce8f4', 'payment', 50000, 0, 50000, 'Số dư ban đầu', v_def_id
            );
        END IF;
    END IF;

    -- 4. Fix Closed Shifts with NULL difference
    UPDATE public.shifts
    SET actual_cash = initial_cash,
        expected_cash = initial_cash,
        difference = 0
    WHERE status = 'closed' AND (difference IS NULL OR expected_cash IS NULL);

END $$;
