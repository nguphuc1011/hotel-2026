
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const sql = `
-- 1. Add missing columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Create customer_transactions table
CREATE TABLE IF NOT EXISTS customer_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
    type text CHECK (type IN ('payment', 'charge', 'adjustment', 'refund')),
    amount numeric NOT NULL,
    balance_before numeric,
    balance_after numeric,
    description text,
    booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    created_by uuid
);

-- 3. Create Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);

-- 4. Create RPC for safe balance adjustment
CREATE OR REPLACE FUNCTION adjust_customer_balance(
    p_customer_id uuid,
    p_amount numeric,
    p_type text,
    p_description text,
    p_booking_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
    v_cust_exists boolean;
BEGIN
    -- Check if customer exists and lock row
    SELECT true, balance INTO v_cust_exists, v_old_balance
    FROM customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF v_cust_exists IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Customer not found');
    END IF;

    v_old_balance := COALESCE(v_old_balance, 0);
    v_new_balance := v_old_balance + p_amount;

    -- Update Customer Balance
    UPDATE customers
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_customer_id;

    -- Log Transaction
    INSERT INTO customer_transactions (
        customer_id, type, amount, balance_before, balance_after, description, booking_id
    ) VALUES (
        p_customer_id, p_type, p_amount, v_old_balance, v_new_balance, p_description, p_booking_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'message', 'Balance updated successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Connected to DB');
    
    await client.query(sql);
    console.log('Migration completed successfully:');
    console.log('- Updated customers table');
    console.log('- Created customer_transactions table');
    console.log('- Created adjust_customer_balance RPC');
    
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

main();
