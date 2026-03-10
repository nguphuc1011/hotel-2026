-- FIX: DROP REMAINING OLD UNIQUE CONSTRAINTS
ALTER TABLE public.cash_flow_categories DROP CONSTRAINT IF EXISTS cash_flow_categories_name_type_key CASCADE;

-- Đảm bảo chỉ có một constraint duy nhất cho Category theo Hotel
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_flow_categories_unique_v2') THEN
        ALTER TABLE public.cash_flow_categories ADD CONSTRAINT cash_flow_categories_unique_v2 UNIQUE (name, type, hotel_id);
    END IF;
END $$;
