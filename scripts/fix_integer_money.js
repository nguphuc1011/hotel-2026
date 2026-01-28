
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const importInventoryFunction = `
CREATE OR REPLACE FUNCTION public.import_inventory(p_service_id uuid, p_qty_buy numeric, p_total_amount numeric, p_notes text, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_payment_method_code text DEFAULT 'cash'::text)
 RETURNS json
 LANGUAGE plpgsql
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
      -- STRICT RULE: ROUND TO INTEGER
      v_new_cost := ROUND(((v_old_stock * v_old_cost) + p_total_amount) / v_new_stock);
  ELSE
      v_new_cost := ROUND(v_old_cost); -- Trường hợp kho vẫn âm hoặc bằng 0 (hiếm)
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
      ROUND(p_total_amount), 
      COALESCE(p_notes, 'Nhập kho: ' || v_service_name), 
      jsonb_build_object(
          'service_id', p_service_id, 
          'qty_buy', p_qty_buy, 
          'unit_buy', v_unit_buy,
          'qty_sell', v_qty_sell,
          'unit_sell', v_unit_sell,
          'conversion', v_conversion_factor,
          'old_cost', ROUND(v_old_cost),
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
          ROUND(p_total_amount), 
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
`;

async function run() {
  try {
    await client.connect();
    console.log('Connected to database');

    console.log('Updating function import_inventory...');
    await client.query(importInventoryFunction);
    console.log('Function updated.');

    console.log('Rounding services.cost_price...');
    const res1 = await client.query(`UPDATE services SET cost_price = ROUND(cost_price) WHERE cost_price <> ROUND(cost_price)`);
    console.log(`Updated ${res1.rowCount} rows in services.`);

    console.log('Rounding booking_services.cost_price_at_time...');
    const res2 = await client.query(`UPDATE booking_services SET cost_price_at_time = ROUND(cost_price_at_time) WHERE cost_price_at_time <> ROUND(cost_price_at_time)`);
    console.log(`Updated ${res2.rowCount} rows in booking_services.`);

    console.log('Rounding cash_flow.amount...');
    const res3 = await client.query(`UPDATE cash_flow SET amount = ROUND(amount) WHERE amount <> ROUND(amount)`);
    console.log(`Updated ${res3.rowCount} rows in cash_flow.`);

    console.log('Rounding transactions.amount...');
    const res4 = await client.query(`UPDATE transactions SET amount = ROUND(amount) WHERE amount <> ROUND(amount)`);
    console.log(`Updated ${res4.rowCount} rows in transactions.`);
    
    // Verification
    console.log('Verifying cash_flow...');
    const check = await client.query(`SELECT count(*) as count FROM cash_flow WHERE amount <> ROUND(amount)`);
    if (check.rows[0].count == 0) {
        console.log('SUCCESS: No decimal values found in cash_flow.');
    } else {
        console.log(`WARNING: Found ${check.rows[0].count} decimal values in cash_flow.`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
