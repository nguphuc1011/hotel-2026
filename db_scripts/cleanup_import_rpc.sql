-- DROP Legacy/Conflicting functions
-- We only want ONE import_inventory function (the one with p_verified_by_staff_id)

-- Drop the 5-arg legacy function (which had hardcoded * 1 logic)
DROP FUNCTION IF EXISTS public.import_inventory(uuid, numeric, numeric, text, uuid);

-- Drop the 6-arg version if it exists (just in case)
DROP FUNCTION IF EXISTS public.import_inventory(uuid, numeric, numeric, text, uuid, text);

-- Drop any other variations that might conflict, except the one we just created
-- Ideally we would drop ALL and recreate, but I just created the correct one.
-- The correct one has signature:
-- import_inventory(uuid, numeric, numeric, text, uuid, text, uuid) 
-- Wait, the correct one I created in fix_inventory_revolution.sql has 7 args:
-- p_service_id, p_qty_buy, p_total_amount, p_payment_method_code, p_shift_id, p_notes, p_verified_by_staff_id

-- Let's just recreate it to be 100% sure we have the latest version and no duplicates.
-- This script will be a "Cleanup & Re-apply" script.

DROP FUNCTION IF EXISTS public.import_inventory(uuid, numeric, numeric, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.import_inventory(
    p_service_id uuid,
    p_qty_buy numeric,           -- Số lượng theo đơn vị mua (VD: 2 thùng)
    p_total_amount numeric,      -- Tổng tiền nhập (VD: 500k)
    p_payment_method_code text DEFAULT 'cash',
    p_shift_id uuid DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_verified_by_staff_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_staff_id uuid;
  v_staff_name text;
  v_old_stock integer;
  v_old_cost numeric;
  v_new_stock integer;
  v_new_cost numeric;
  v_conversion_factor integer;
  v_qty_sell integer;       -- Số lượng sau quy đổi (VD: 48 chai)
  v_unit_cost numeric;      -- Giá vốn đơn vị sau quy đổi
  v_transaction_id uuid;
  v_service_name text;
  v_unit_buy text;
  v_unit_sell text;
BEGIN
  -- 1. Xác thực nhân viên
  v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
  SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

  -- 2. Lấy thông tin hiện tại & Khóa dòng (Lock)
  SELECT name, COALESCE(stock_quantity, 0), COALESCE(cost_price, 0), COALESCE(conversion_factor, 1), unit_buy, unit_sell
  INTO v_service_name, v_old_stock, v_old_cost, v_conversion_factor, v_unit_buy, v_unit_sell
  FROM public.services 
  WHERE id = p_service_id 
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Dịch vụ không tồn tại'; END IF;

  -- 3. Tính toán quy đổi (Conversion Logic)
  v_qty_sell := ROUND(p_qty_buy * v_conversion_factor);
  
  -- 4. Tính giá vốn bình quân gia quyền (Weighted Average Cost)
  -- Công thức: ((Tồn cũ * Giá cũ) + (Nhập mới * Giá nhập)) / (Tồn cũ + Nhập mới)
  v_new_stock := v_old_stock + v_qty_sell;
  
  IF v_new_stock > 0 THEN
      v_new_cost := ((v_old_stock * v_old_cost) + p_total_amount) / v_new_stock;
  ELSE
      v_new_cost := v_old_cost; -- Trường hợp kho vẫn âm hoặc bằng 0 (hiếm)
  END IF;

  -- 5. Tạo Transaction (Giao dịch nhập kho)
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
          'unit_buy', v_unit_buy,
          'qty_sell', v_qty_sell,
          'unit_sell', v_unit_sell,
          'conversion', v_conversion_factor,
          'old_cost', v_old_cost,
          'new_cost', v_new_cost,
          'payment_method', LOWER(COALESCE(p_payment_method_code, 'cash'))
      )
  ) RETURNING id INTO v_transaction_id;

  -- 6. Tạo Dòng tiền (Cash Flow) - Chi tiền nhập hàng
  -- Chỉ tạo nếu có chi tiền (> 0)
  IF p_total_amount > 0 THEN 
      INSERT INTO public.cash_flow (
          flow_type, 
          category, 
          amount, 
          description, 
          occurred_at, 
          created_by, 
          verified_by_staff_id, 
          verified_by_staff_name, 
          ref_id, 
          payment_method_code
      ) VALUES (
          'OUT', 
          'Nhập hàng', 
          p_total_amount, 
          'Nhập kho: ' || v_service_name || ' (' || p_qty_buy || ' ' || COALESCE(v_unit_buy, 'đơn vị') || ')', 
          now(), 
          v_staff_id, 
          v_staff_id, 
          v_staff_name, 
          v_transaction_id, 
          LOWER(COALESCE(p_payment_method_code, 'cash'))
      ); 
  END IF;

  -- 7. Cập nhật Kho & Giá vốn (Core Update)
  UPDATE public.services 
  SET 
      stock_quantity = v_new_stock, 
      cost_price = v_new_cost, 
      track_inventory = true, 
      updated_at = now() 
  WHERE id = p_service_id;

  -- 8. Ghi Log Kho (Inventory Log) - Để truy vết số lượng
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
      v_qty_sell, -- Ghi nhận số lượng thực tế nhập vào (đơn vị bán)
      v_old_stock, 
      v_new_stock, 
      v_transaction_id, 
      COALESCE(p_notes, '') || ' (Quy đổi: ' || p_qty_buy || ' ' || COALESCE(v_unit_buy, '') || ' -> ' || v_qty_sell || ' ' || COALESCE(v_unit_sell, '') || ')', 
      v_staff_id
  );

  RETURN json_build_object(
      'status', 'success', 
      'service_id', p_service_id, 
      'new_stock', v_new_stock,
      'new_cost', v_new_cost,
      'transaction_id', v_transaction_id
  );
END;
$function$;
