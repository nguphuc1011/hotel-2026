
const { Client } = require('pg');

const connectionString = "postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

const client = new Client({
  connectionString: connectionString,
});

const sql = `
-- FIX: adjust_customer_balance (Add cash flow integration)
DROP FUNCTION IF EXISTS public.adjust_customer_balance(uuid, numeric, text, text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
    p_customer_id uuid, 
    p_amount numeric, 
    p_type text, 
    p_description text, 
    p_booking_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text,
    p_payment_method text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
    v_cust_exists boolean;
    v_flow_type text;
    v_category text;
    v_method_code text;
    v_cash_flow_amount numeric;
BEGIN
    -- 1. Check if customer exists and lock row
    SELECT true, balance INTO v_cust_exists, v_old_balance
    FROM customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF v_cust_exists IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Customer not found');
    END IF;

    v_old_balance := COALESCE(v_old_balance, 0);
    v_new_balance := v_old_balance + p_amount;

    -- 2. Update Customer Balance
    UPDATE customers
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_customer_id;

    -- 3. Log Transaction (Internal Customer Ledger)
    INSERT INTO customer_transactions (
        customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_customer_id, p_type, p_amount, v_old_balance, v_new_balance, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_booking_id, p_verified_by_staff_id, p_verified_by_staff_name
    );

    -- 4. INSERT CASH FLOW (To trigger Wallet Sync)
    -- Determine Flow Type, Category, and Method based on Action Type
    v_cash_flow_amount := ABS(p_amount);
    v_method_code := lower(p_payment_method);

    IF p_type = 'payment' THEN
        -- Khách trả tiền (Nạp tiền vào tài khoản) -> IN
        -- Đây là hành động Thu Nợ hoặc Nạp Cọc
        -- Nếu dùng category 'Thu nợ', fn_sync_wallets sẽ trừ Receivable, tăng Cash.
        v_flow_type := 'IN';
        v_category := 'Thu nợ';
    
    ELSIF p_type = 'refund' THEN
        -- Trả lại tiền cho khách -> OUT
        v_flow_type := 'OUT';
        v_category := 'Hoàn tiền';
        
    ELSIF p_type = 'charge' THEN
        -- Ghi nợ khách (Trừ tiền tài khoản) -> Credit Sales
        -- Tăng Revenue, Tăng Receivable
        v_flow_type := 'IN';
        v_category := 'Phụ phí'; -- Hoặc Dịch vụ
        v_method_code := 'credit'; -- Force credit method for charge
        
    ELSE -- 'adjustment'
        IF p_amount > 0 THEN
            -- Điều chỉnh tăng (như nạp tiền)
            v_flow_type := 'IN';
            v_category := 'Thu nợ';
        ELSE
            -- Điều chỉnh giảm (như ghi nợ)
            v_flow_type := 'IN';
            v_category := 'Phụ phí';
            v_method_code := 'credit';
        END IF;
    END IF;

    -- Insert into Cash Flow
    INSERT INTO public.cash_flow (
        flow_type, 
        category, 
        amount, 
        description, 
        created_by, 
        verified_by_staff_id, 
        verified_by_staff_name, 
        ref_id, -- Link to Customer ID as Ref? Or Booking? Let's use Customer ID if no Booking.
        is_auto, 
        payment_method_code, 
        occurred_at
    ) VALUES (
        v_flow_type,
        v_category,
        v_cash_flow_amount,
        p_description || ' (KH: ' || p_customer_id || ')',
        auth.uid(),
        p_verified_by_staff_id,
        p_verified_by_staff_name,
        COALESCE(p_booking_id, p_customer_id),
        true,
        v_method_code,
        now()
    );

    RETURN jsonb_build_object(
        'success', true, 
        'new_balance', v_new_balance, 
        'message', 'Balance updated and cash flow recorded successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;
`;

async function run() {
  try {
    await client.connect();
    console.log('Connected to database.');
    await client.query(sql);
    console.log('Function adjust_customer_balance updated successfully.');
  } catch (err) {
    console.error('Error executing SQL:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
