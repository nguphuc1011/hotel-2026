-- Migration to fix customers table and ensure all required columns exist
DO $$ 
BEGIN
    -- Ensure created_at exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='created_at') THEN
        ALTER TABLE customers ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Ensure plate_number exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='plate_number') THEN
        ALTER TABLE customers ADD COLUMN plate_number TEXT;
    END IF;

    -- Ensure total_spent exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='total_spent') THEN
        ALTER TABLE customers ADD COLUMN total_spent NUMERIC DEFAULT 0;
    END IF;

    -- Ensure visit_count exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='visit_count') THEN
        ALTER TABLE customers ADD COLUMN visit_count INTEGER DEFAULT 1;
    END IF;

    -- Ensure ocr_data exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='ocr_data') THEN
        ALTER TABLE customers ADD COLUMN ocr_data JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Fix RLS Policy for customers to be explicit
DROP POLICY IF EXISTS "Enable all for authenticated" ON customers;
CREATE POLICY "Enable all for authenticated" ON customers 
    FOR ALL 
    TO authenticated 
    USING (true)
    WITH CHECK (true);
