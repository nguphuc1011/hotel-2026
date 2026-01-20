-- UPDATE IMPORT INVENTORY RPC TO INTEGRATE WITH CASH FLOW
CREATE OR REPLACE FUNCTION public.import_inventory(
  p_service_id uuid, 
  p_qty_buy numeric, 
  p_total_amount numeric, 
  p_payment_method_code text DEFAULT NULL::text, 
  p_shift_id uuid DEFAULT NULL::uuid, 
  p_notes text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_staff_id uuid;

  v_old_stock integer;
  v_old_cost numeric;

  v_new_stock integer;
  v_new_cost numeric;

  v_conversion_factor integer;
  v_qty_sell integer;
  v_unit_cost numeric;

  v_ledger_id uuid;
  v_service_name text;
BEGIN
  -- 3.1. Xác định người thực hiện + role
  v_role := auth.jwt() ->> 'role';
  v_staff_id := auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Không xác định người thực hiện (auth.uid() = NULL)';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('admin','manager','staff') THEN
    RAISE EXCEPTION 'Không đủ quyền nhập kho';
  END IF;

  -- 3.2. Kiểm tra input
  IF p_qty_buy IS NULL OR p_qty_buy <= 0 THEN
    RAISE EXCEPTION 'Số lượng nhập phải > 0';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount < 0 THEN
    RAISE EXCEPTION 'Tổng tiền nhập phải >= 0';
  END IF;

  IF p_payment_method_code IS NOT NULL THEN
    PERFORM 1
    FROM public.payment_methods
    WHERE code = p_payment_method_code AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_method_code không hợp lệ hoặc không active';
    END IF;
  END IF;

  IF p_shift_id IS NOT NULL THEN
    PERFORM 1
    FROM public.shifts
    WHERE id = p_shift_id AND status = 'open';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'shift_id không hợp lệ hoặc ca không open';
    END IF;
  END IF;

  -- 3.3. Lấy thông tin dịch vụ và khóa hàng (FOR UPDATE)
  SELECT
    name,
    COALESCE(stock, 0),
    COALESCE(cost_price, 0),
    COALESCE(conversion_factor, 1)
  INTO v_service_name, v_old_stock, v_old_cost, v_conversion_factor
  FROM public.services
  WHERE id = p_service_id
    AND deleted_at IS NULL
    AND COALESCE(is_active, true) = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dịch vụ không tồn tại / đã xoá / không active';
  END IF;

  IF v_conversion_factor < 1 THEN
    RAISE EXCEPTION 'conversion_factor không hợp lệ (phải >= 1)';
  END IF;

  -- 3.4. Quy đổi và tính giá vốn
  v_qty_sell := ROUND(p_qty_buy * v_conversion_factor);

  IF v_qty_sell <= 0 THEN
    RAISE EXCEPTION 'Số lượng quy đổi không hợp lệ';
  END IF;

  v_unit_cost := p_total_amount / v_qty_sell;

  v_new_stock := v_old_stock + v_qty_sell;
  
  -- Tính giá vốn bình quân gia quyền
  IF v_new_stock > 0 THEN
    v_new_cost := ((v_old_stock * v_old_cost) + p_total_amount) / v_new_stock;
  ELSE
    v_new_cost := v_unit_cost;
  END IF;

  -- 3.5. Ghi ledger (Hệ thống cũ - Giữ để tương thích)
  INSERT INTO public.ledger (
    shift_id, staff_id, type, category, amount,
    payment_method_code, description, meta
  ) VALUES (
    p_shift_id,
    v_staff_id,
    'EXPENSE',
    'Inventory',
    p_total_amount,
    p_payment_method_code,
    COALESCE(p_notes, 'Nhập kho: ' || v_service_name),
    jsonb_build_object(
      'service_id', p_service_id,
      'qty_buy', p_qty_buy,
      'conversion_factor', v_conversion_factor,
      'qty_sell', v_qty_sell,
      'unit_cost', v_unit_cost
    )
  )
  RETURNING id INTO v_ledger_id;

  -- 3.6. Ghi CASH FLOW (Hệ thống mới)
  IF p_total_amount > 0 THEN
    INSERT INTO public.cash_flow (
        flow_type, 
        category, 
        amount, 
        description, 
        occurred_at, 
        created_by, 
        ref_id, 
        is_auto
    )
    VALUES (
        'OUT', 
        'Nhập hàng', 
        p_total_amount, 
        'Nhập kho: ' || v_service_name || ' (SL: ' || p_qty_buy || ')', 
        now(), 
        v_staff_id, 
        v_ledger_id, 
        true
    );
  END IF;

  -- 3.7. Cập nhật kho
  UPDATE public.services
  SET stock = v_new_stock,
      cost_price = v_new_cost,
      track_inventory = true
  WHERE id = p_service_id;

  -- 3.8. Ghi lịch sử kho
  INSERT INTO public.stock_history (
    service_id, action_type, quantity, details
  ) VALUES (
    p_service_id,
    'IMPORT',
    v_qty_sell,
    jsonb_build_object(
      'ledger_id', v_ledger_id,
      'staff_id', v_staff_id,
      'shift_id', p_shift_id,
      'payment_method_code', p_payment_method_code,
      'notes', p_notes,
      'old_stock', v_old_stock,
      'new_stock', v_new_stock,
      'old_cost_price', v_old_cost,
      'new_cost_price', v_new_cost,
      'total_amount', p_total_amount,
      'unit_cost', v_unit_cost,
      'qty_buy', p_qty_buy,
      'qty_sell', v_qty_sell,
      'conversion_factor', v_conversion_factor
    )
  );

  RETURN json_build_object(
    'status', 'success',
    'service_id', p_service_id,
    'ledger_id', v_ledger_id,
    'qty_sell', v_qty_sell,
    'new_stock', v_new_stock,
    'new_cost_price', v_new_cost
  );
END;
$function$;
