-- Migration: Fix "column type does not exist" in financial_transactions
-- Date: 2026-01-04
-- Purpose: Ensure financial_transactions table has all required columns for debt payment

-- 1. FIX TABLE SCHEMA
DO $$ 
BEGIN
    -- Check and add 'type' column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='type') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN type TEXT CHECK (type IN ('income','expense'));
    END IF;
    
    -- Check and add 'transaction_id' column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='transaction_id') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;
    END IF;

    -- Check and add 'method' column (just in case)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='method') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN method TEXT;
    END IF;

    -- Check and add 'amount' column (just in case)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='amount') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN amount NUMERIC NOT NULL DEFAULT 0;
    END IF;

    -- Check and add 'cashier' column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='cashier') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN cashier TEXT;
    END IF;

    -- Check and add 'notes' column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='notes') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN notes TEXT;
    END IF;

    -- Check and add 'customer_id' column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='customer_id') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
    END IF;

    -- Check and add 'booking_id' column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='booking_id') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;
    END IF;

    -- Check and add 'meta' column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='meta') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN meta JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. RELOAD handle_debt_payment FUNCTION
-- Ensure the function is defined correctly and uses the columns
CREATE OR REPLACE FUNCTION public.handle_debt_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_method TEXT,
  p_cashier TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx_id UUID;
  v_fin_id UUID;
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- 1. Create Transaction Record (Debt Recovery)
  INSERT INTO public.transactions(
    id, customer_id, type, amount, method, cashier, notes, created_at, meta
  )
  VALUES (
    gen_random_uuid(), p_customer_id, 'debt_recovery', p_amount, p_method, p_cashier, COALESCE(p_note, ''), NOW(), '{}'::jsonb
  )
  RETURNING id INTO v_tx_id;

  -- 2. Create Financial Transaction (Income)
  INSERT INTO public.financial_transactions(
    id, transaction_id, customer_id, type, method, amount, cashier, notes, created_at, meta
  )
  VALUES (
    gen_random_uuid(), v_tx_id, p_customer_id, 'income', p_method, p_amount, p_cashier, p_note, NOW(), '{}'::jsonb
  )
  RETURNING id INTO v_fin_id;

  -- 3. Update Customer Balance
  UPDATE public.customers
  SET balance = COALESCE(balance, 0) + p_amount
  WHERE id = p_customer_id
  RETURNING balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id, 
    'financial_id', v_fin_id, 
    'new_balance', v_new_balance
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 3. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.handle_debt_payment TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_debt_payment TO service_role;
