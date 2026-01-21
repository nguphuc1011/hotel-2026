-- FIX ROOT CAUSE: SCHEMA MISMATCH & AUTH FLOW
-- 1. Fix Schema: cash_flow.created_by references auth.users (which is empty) -> Change to public.staff
-- 2. Fix RPC: import_inventory needs p_staff_id because we use Custom Auth (not Supabase Auth)

-- STEP 1: Fix Foreign Key Constraint on cash_flow
DO $$
BEGIN
    -- Drop incorrect FK (referencing auth.users)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_flow_created_by_fkey') THEN
        ALTER TABLE public.cash_flow DROP CONSTRAINT cash_flow_created_by_fkey;
    END IF;

    -- Add correct FK (referencing public.staff)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_flow_created_by_staff_fkey') THEN
        ALTER TABLE public.cash_flow 
        ADD CONSTRAINT cash_flow_created_by_staff_fkey 
        FOREIGN KEY (created_by) REFERENCES public.staff(id) ON DELETE SET NULL;
    END IF;
END $$;

-- STEP 2: Update Import Inventory RPC
-- We must use SECURITY DEFINER because the user is 'anon' (Custom Auth) but needs to write to DB.
-- We must accept p_staff_id because auth.uid() is NULL in Custom Auth.

DROP FUNCTION IF EXISTS public.import_inventory(uuid, numeric, numeric, text, uuid, text);

CREATE OR REPLACE FUNCTION public.import_inventory(
    p_service_id uuid,
    p_qty_buy numeric,
    p_total_amount numeric,
    p_payment_method_code text DEFAULT NULL::text,
    p_shift_id uuid DEFAULT NULL::uuid,
    p_notes text DEFAULT NULL::text,
    p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staff_id uuid;
  v_old_stock integer;
  v_old_cost numeric;
  v_new_stock integer;
  v_new_cost numeric;
  v_conversion_factor integer;
  v_qty_sell integer;
  v_unit_cost numeric;
  v_transaction_id uuid;
  v_service_name text;
BEGIN
  -- 1. Identify Staff (Root Cause Fix: Use explicitly passed ID from Custom Auth)
  v_staff_id := p_staff_id;
  
  -- Fallback only if p_staff_id is missing (backward compatibility)
  IF v_staff_id IS NULL THEN
      v_staff_id := auth.uid();
  END IF;

  -- 2. Validate Inputs
  IF p_qty_buy IS NULL OR p_qty_buy <= 0 THEN
    RAISE EXCEPTION 'Số lượng nhập phải > 0';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount < 0 THEN
    RAISE EXCEPTION 'Tổng tiền nhập phải >= 0';
  END IF;

  -- 3. Lock & Get Service Info
  SELECT
    name,
    COALESCE(stock_quantity, 0),
    COALESCE(cost_price, 0),
    COALESCE(conversion_factor, 1)
  INTO v_service_name, v_old_stock, v_old_cost, v_conversion_factor
  FROM public.services
  WHERE id = p_service_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dịch vụ không tồn tại';
  END IF;

  IF v_conversion_factor < 1 THEN
    RAISE EXCEPTION 'conversion_factor không hợp lệ (phải >= 1)';
  END IF;

  -- 4. Calculate
  v_qty_sell := ROUND(p_qty_buy * v_conversion_factor);

  IF v_qty_sell <= 0 THEN
    RAISE EXCEPTION 'Số lượng quy đổi phải > 0';
  END IF;

  v_unit_cost := p_total_amount / v_qty_sell;
  v_new_stock := v_old_stock + v_qty_sell;

  IF v_new_stock > 0 THEN
    v_new_cost := ((v_old_stock * v_old_cost) + p_total_amount) / v_new_stock;
  ELSE
    v_new_cost := v_unit_cost;
  END IF;

  -- 5. Record Transaction
  INSERT INTO public.transactions (
    type,
    staff_id,
    amount,
    reason,
    new_value
  ) VALUES (
    'IMPORT_INVENTORY',
    v_staff_id,
    p_total_amount,
    COALESCE(p_notes, 'Nhập kho: ' || v_service_name),
    jsonb_build_object(
      'service_id', p_service_id,
      'qty_buy', p_qty_buy,
      'conversion_factor', v_conversion_factor,
      'qty_sell', v_qty_sell,
      'unit_cost', v_unit_cost,
      'payment_method', p_payment_method_code,
      'shift_id', p_shift_id
    )
  )
  RETURNING id INTO v_transaction_id;

  -- 6. Record Cash Flow
  IF p_total_amount > 0 THEN
    INSERT INTO public.cash_flow (
        flow_type,
        category,
        amount,
        description,
        occurred_at,
        created_by, -- Now references public.staff(id)
        ref_id
    )
    VALUES (
        'OUT',
        'Nhập hàng',
        p_total_amount,
        'Nhập kho: ' || v_service_name || ' (SL: ' || p_qty_buy || ')',
        now(),
        v_staff_id,
        v_transaction_id
    );
  END IF;

  -- 7. Update Service
  UPDATE public.services
  SET stock_quantity = v_new_stock,
      stock = v_new_stock,
      cost_price = v_new_cost,
      track_inventory = true,
      updated_at = now()
  WHERE id = p_service_id;

  -- 8. Record Log
  INSERT INTO public.inventory_logs (
    service_id,
    type,
    quantity,
    balance_before,
    balance_after,
    reference_id,
    notes,
    created_by
  ) VALUES (
    p_service_id,
    'IMPORT',
    v_qty_sell,
    v_old_stock,
    v_new_stock,
    v_transaction_id,
    p_notes,
    v_staff_id
  );

  RETURN json_build_object(
    'status', 'success',
    'service_id', p_service_id,
    'transaction_id', v_transaction_id
    -- 'new_stock', v_new_stock -- Optional
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.import_inventory TO authenticated, service_role, anon;
