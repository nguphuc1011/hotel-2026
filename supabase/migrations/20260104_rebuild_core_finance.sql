ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS balance NUMERIC NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('room_charge','service_charge','payment','deposit','debt_recovery','reversal')),
  amount NUMERIC NOT NULL,
  method TEXT CHECK (method IN ('cash','bank_transfer','card','other')) NULL,
  cashier TEXT,
  notes TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  method TEXT CHECK (method IN ('cash','bank_transfer','card','other')) NULL,
  amount NUMERIC NOT NULL,
  cashier TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  method TEXT CHECK (method IN ('cash','bank_transfer','card','other')) NULL,
  cashier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.inventory_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  before_qty NUMERIC,
  after_qty NUMERIC,
  diff_qty NUMERIC,
  actor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.services;
DROP POLICY IF EXISTS policy_transactions_select ON public.transactions;
DROP POLICY IF EXISTS policy_transactions_insert ON public.transactions;
DROP POLICY IF EXISTS policy_financial_transactions_select ON public.financial_transactions;
DROP POLICY IF EXISTS policy_financial_transactions_insert ON public.financial_transactions;
DROP POLICY IF EXISTS policy_expenses_select ON public.expenses;
DROP POLICY IF EXISTS policy_expenses_insert ON public.expenses;
DROP POLICY IF EXISTS policy_inventory_audits_select ON public.inventory_audits;
DROP POLICY IF EXISTS policy_inventory_audits_insert ON public.inventory_audits;
DROP POLICY IF EXISTS policy_services_select ON public.services;
DROP POLICY IF EXISTS policy_services_write ON public.services;
CREATE POLICY policy_transactions_select ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY policy_transactions_insert ON public.transactions FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','manager','staff'));
CREATE POLICY policy_financial_transactions_select ON public.financial_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY policy_financial_transactions_insert ON public.financial_transactions FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','manager','staff'));
CREATE POLICY policy_expenses_select ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY policy_expenses_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','manager'));
CREATE POLICY policy_inventory_audits_select ON public.inventory_audits FOR SELECT TO authenticated USING (true);
CREATE POLICY policy_inventory_audits_insert ON public.inventory_audits FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','manager','staff'));
CREATE POLICY policy_services_select ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY policy_services_write ON public.services FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'role') IN ('admin','manager'));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_room_charge_per_day ON public.transactions (booking_id, ((created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)) WHERE type = 'room_charge';
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
  INSERT INTO public.transactions(id, customer_id, type, amount, method, cashier, notes, created_at, meta)
  VALUES (gen_random_uuid(), p_customer_id, 'debt_recovery', p_amount, p_method, p_cashier, COALESCE(p_note, ''), NOW(), '{}'::jsonb)
  RETURNING id INTO v_tx_id;
  INSERT INTO public.financial_transactions(id, transaction_id, customer_id, type, method, amount, cashier, notes, created_at, meta)
  VALUES (gen_random_uuid(), v_tx_id, p_customer_id, 'income', p_method, p_amount, p_cashier, p_note, NOW(), '{}'::jsonb)
  RETURNING id INTO v_fin_id;
  UPDATE public.customers
  SET balance = COALESCE(balance, 0) + p_amount
  WHERE id = p_customer_id
  RETURNING balance INTO v_new_balance;
  RETURN jsonb_build_object('transaction_id', v_tx_id, 'financial_id', v_fin_id, 'new_balance', v_new_balance);
END;
$$;
CREATE OR REPLACE FUNCTION public.night_audit(
  p_audit_date DATE DEFAULT (NOW()::DATE)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_created_count INTEGER := 0;
  rec RECORD;
  v_price NUMERIC;
  v_tx_id UUID;
BEGIN
  FOR rec IN
    SELECT b.id AS booking_id, b.customer_id, COALESCE(b.initial_price, 0) AS price
    FROM public.bookings b
    WHERE b.status = 'active' AND b.deleted_at IS NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.booking_id = rec.booking_id AND t.type = 'room_charge' AND (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_audit_date
    ) THEN
      CONTINUE;
    END IF;
    v_price := COALESCE(rec.price, 0);
    INSERT INTO public.transactions(id, booking_id, customer_id, type, amount, notes, created_at, meta)
    VALUES (
      gen_random_uuid(),
      rec.booking_id,
      rec.customer_id,
      'room_charge',
      v_price,
      'night_audit',
      (p_audit_date::timestamptz + time '00:00'),
      jsonb_build_object('audit_date', p_audit_date)
    )
    RETURNING id INTO v_tx_id;
    UPDATE public.customers
    SET balance = COALESCE(balance, 0) - v_price
    WHERE id = rec.customer_id;
    v_created_count := v_created_count + 1;
  END LOOP;
  RETURN jsonb_build_object('audit_date', p_audit_date, 'charges_created', v_created_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.handle_debt_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.night_audit(DATE) TO authenticated, service_role;
NOTIFY pgrst, 'reload config';
