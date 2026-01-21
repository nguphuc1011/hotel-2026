-- FIX: Import Inventory RPC (Root Cause Fix for Custom Auth)
-- 1. Add p_staff_id parameter to explicitly track who performed the action (since auth.uid() is null in Custom Auth)
-- 2. Use SECURITY DEFINER to bypass RLS on cash_flow (since connection is anon)
-- 3. Ensure logic consistency (Round quantity, Update stock/stock_quantity)

-- LƯU Ý: Chạy toàn bộ script này trong SQL Editor của Supabase

-- DROP OLD FUNCTION to avoid ambiguity when changing signature
DROP FUNCTION IF EXISTS public.import_inventory(uuid, numeric, numeric, text, uuid, text);

CREATE OR REPLACE FUNCTION public.import_inventory(
    p_service_id uuid,
    p_qty_buy numeric,
    p_total_amount numeric,
    p_payment_method_code text DEFAULT NULL::text,
    p_shift_id uuid DEFAULT NULL::uuid,
    p_notes text DEFAULT NULL::text,
    p_staff_id uuid DEFAULT NULL::uuid -- NEW PARAMETER
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- REQUIRED: Bypass RLS because Custom Auth uses anon connection
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
  -- 1. Determine User Identity
  -- Prioritize explicit p_staff_id (from Frontend Custom Auth)
  -- Fallback to auth.uid() (if using Supabase Auth in future)
  v_staff_id := COALESCE(p_staff_id, auth.uid());

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
  FOR UPDATE; -- Lock row to prevent race conditions

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dịch vụ không tồn tại';
  END IF;

  IF v_conversion_factor < 1 THEN
    RAISE EXCEPTION 'conversion_factor không hợp lệ (phải >= 1)';
  END IF;

  -- 4. Calculate Inventory & Cost
  -- Note: stock_quantity is INTEGER, so we must ROUND.
  v_qty_sell := ROUND(p_qty_buy * v_conversion_factor);

  IF v_qty_sell <= 0 THEN
    RAISE EXCEPTION 'Số lượng quy đổi phải > 0 (Kiểm tra lại đơn vị tính)';
  END IF;

  v_unit_cost := p_total_amount / v_qty_sell;
  v_new_stock := v_old_stock + v_qty_sell;

  -- Weighted Average Cost Calculation
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

  -- 6. Record Cash Flow (if amount > 0)
  -- Uses SECURITY DEFINER to bypass RLS
  IF p_total_amount > 0 THEN
    INSERT INTO public.cash_flow (
        flow_type,
        category,
        amount,
        description,
        occurred_at,
        created_by,
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

  -- 7. Update Service Stock
  UPDATE public.services
  SET stock_quantity = v_new_stock,
      stock = v_new_stock, -- Legacy support
      cost_price = v_new_cost,
      track_inventory = true,
      updated_at = now()
  WHERE id = p_service_id;

  -- 8. Record Inventory Log
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
    'transaction_id', v_transaction_id,
    'qty_sell', v_qty_sell,
    'new_stock', v_new_stock,
    'new_cost_price', v_new_cost
  );
END;
$function$;

-- Grant permissions to ensure accessibility
GRANT EXECUTE ON FUNCTION public.import_inventory TO authenticated, service_role, anon;

-- VERIFICATION SCRIPT
-- SELECT proname, prosecdef, prosrc FROM pg_proc WHERE proname = 'import_inventory';
