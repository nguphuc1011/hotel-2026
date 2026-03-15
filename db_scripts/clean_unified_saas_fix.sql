-- CLEAN COMPREHENSIVE FIX: MULTI-TENANT SAAS (HOTEL_ID) & RPC ALIGNMENT
-- Run this in Supabase SQL Editor

---------------------------------------------------------
-- 1. ADD MISSING HOTEL_ID COLUMNS
---------------------------------------------------------
ALTER TABLE public.pending_approvals ADD COLUMN IF NOT EXISTS hotel_id uuid;
ALTER TABLE public.settings_security ADD COLUMN IF NOT EXISTS hotel_id uuid;
ALTER TABLE public.staff_debts ADD COLUMN IF NOT EXISTS hotel_id uuid;

---------------------------------------------------------
-- 2. SET AUTOMATIC DEFAULTS FOR HOTEL_ID
-- This ensures hotel_id is auto-filled from headers
---------------------------------------------------------
DO $$ 
DECLARE 
    v_table text;
    v_tables text[] := ARRAY[
        'booking_services', 'customers', 'customer_transactions', 'inventory_logs', 
        'booking_snapshots', 'user_floors', 'wallets', 'services', 
        'cash_flow_categories', 'external_payables', 'audit_logs', 'role_permissions', 
        'bookings', 'rooms', 'staff', 'cash_flow', 'shifts', 'settings', 
        'room_categories', 'pending_approvals', 'settings_security', 'staff_debts'
    ];
BEGIN 
    FOREACH v_table IN ARRAY v_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN hotel_id SET DEFAULT public.fn_get_tenant_id()', v_table);
    END LOOP;
END $$;

---------------------------------------------------------
-- 3. FIX fn_adjust_wallet_balance (RPC Alignment)
---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adjust_wallet_balance(
    p_wallet_id text,
    p_actual_balance numeric,
    p_reason text,
    p_verified_by_staff_id uuid DEFAULT NULL,
    p_verified_by_staff_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance numeric;
    v_diff numeric;
    v_flow_type text;
    v_hotel_id uuid;
    v_staff_id uuid;
    v_staff_name text;
    v_new_id uuid;
BEGIN
    v_hotel_id := public.fn_get_tenant_id();
    IF v_hotel_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi bảo mật: Không xác định được định danh khách sạn.');
    END IF;

    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id AND hotel_id = v_hotel_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    SELECT balance INTO v_current_balance 
    FROM public.wallets 
    WHERE id = p_wallet_id AND hotel_id = v_hotel_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy quỹ: ' || p_wallet_id);
    END IF;

    v_diff := p_actual_balance - v_current_balance;
    IF v_diff = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Số dư đã khớp, không cần điều chỉnh.');
    END IF;

    v_flow_type := CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END;

    INSERT INTO public.cash_flow (
        hotel_id, flow_type, category, amount, description, 
        occurred_at, created_by, verified_by_staff_id, verified_by_staff_name, 
        payment_method_code, is_auto
    )
    VALUES (
        v_hotel_id, v_flow_type, 'Điều chỉnh', ABS(v_diff),
        'Điều chỉnh số dư: ' || COALESCE(p_reason, '') || ' (Hệ thống: ' || v_current_balance || ', Thực tế: ' || p_actual_balance || ')',
        now(), v_staff_id, v_staff_id, v_staff_name,
        CASE WHEN p_wallet_id = 'CASH' THEN 'cash' ELSE 'bank' END, true
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'message', 'Điều chỉnh số dư thành công', 'data', jsonb_build_object('id', v_new_id, 'diff', v_diff, 'new_balance', p_actual_balance));
END;
$$;

---------------------------------------------------------
-- 4. FIX fn_create_approval_request
---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_approval_request(
    p_action_key text, 
    p_request_data jsonb DEFAULT '{}'::jsonb, 
    p_staff_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_id uuid;
    v_staff_id uuid;
    v_hotel_id uuid;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());
    v_hotel_id := public.fn_get_tenant_id();
    
    IF v_staff_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không xác định được nhân viên yêu cầu');
    END IF;

    INSERT INTO public.pending_approvals (hotel_id, action_key, staff_id, request_data)
    VALUES (v_hotel_id, p_action_key, v_staff_id, p_request_data)
    RETURNING id INTO v_id;
    
    RETURN jsonb_build_object('success', true, 'request_id', v_id, 'approval_id', v_id);
END;
$$;

---------------------------------------------------------
-- 5. FIX fn_delete_cash_flow
---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_delete_cash_flow(
    p_id uuid, 
    p_reason text DEFAULT NULL::text, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_name text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_record RECORD;
    v_user_id uuid;
    v_void_id uuid;
    v_policy text;
    v_cust_id uuid;
    v_sync_msg text := '';
    v_hotel_id uuid;
BEGIN
    v_user_id := auth.uid();
    v_hotel_id := public.fn_get_tenant_id();

    SELECT public.fn_resolve_policy(v_user_id, 'finance_delete_transaction') INTO v_policy;
    IF v_policy = 'DENY' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bạn không có quyền Xóa giao dịch.');
    END IF;

    SELECT * INTO v_record FROM public.cash_flow WHERE id = p_id AND hotel_id = v_hotel_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Giao dịch không tồn tại.');
    END IF;
    
    IF COALESCE(v_record.is_auto, false) = true THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không thể xóa giao dịch tự động của hệ thống.');
    END IF;

    INSERT INTO public.cash_flow (
        hotel_id, flow_type, category, amount, description, occurred_at, created_by, 
        ref_id, payment_method_code, customer_id, verified_by_staff_id, verified_by_staff_name
    )
    VALUES (
        v_hotel_id, v_record.flow_type, v_record.category, -v_record.amount,
        'VOID: ' || v_record.description || COALESCE(' - Lý do: ' || p_reason, ''),
        now(), v_user_id, v_record.id, v_record.payment_method_code, v_record.customer_id,
        p_verified_by_staff_id, p_verified_by_staff_name
    )
    RETURNING id INTO v_void_id;

    v_cust_id := v_record.customer_id;
    IF v_cust_id IS NULL AND v_record.ref_id IS NOT NULL THEN
        SELECT customer_id INTO v_cust_id FROM public.bookings WHERE id = v_record.ref_id AND hotel_id = v_hotel_id;
    END IF;

    IF v_cust_id IS NOT NULL THEN
       DECLARE
            v_current_balance numeric;
            v_new_balance numeric;
       BEGIN
           SELECT balance INTO v_current_balance FROM public.customers WHERE id = v_cust_id AND hotel_id = v_hotel_id;
           v_current_balance := COALESCE(v_current_balance, 0);

           IF v_record.category = 'Tiền cọc' AND v_record.ref_id IS NOT NULL THEN
                UPDATE public.bookings SET deposit_amount = GREATEST(0, deposit_amount - v_record.amount) WHERE id = v_record.ref_id AND hotel_id = v_hotel_id;
                v_sync_msg := ' (Đã cập nhật lại tiền cọc Booking)';
           ELSIF v_record.flow_type = 'IN' THEN
                v_new_balance := v_current_balance - v_record.amount;
                UPDATE public.customers SET balance = v_new_balance WHERE id = v_cust_id AND hotel_id = v_hotel_id;
                INSERT INTO public.customer_transactions (hotel_id, customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by)
                VALUES (v_hotel_id, v_cust_id, 'adjustment', -v_record.amount, v_current_balance, v_new_balance, 'Hủy phiếu thu: ' || v_record.description, v_record.ref_id, v_user_id);
                v_sync_msg := ' (Đã cập nhật lại công nợ khách)';
           ELSIF v_record.flow_type = 'OUT' THEN
                v_new_balance := v_current_balance + v_record.amount;
                UPDATE public.customers SET balance = v_new_balance WHERE id = v_cust_id AND hotel_id = v_hotel_id;
                INSERT INTO public.customer_transactions (hotel_id, customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by)
                VALUES (v_hotel_id, v_cust_id, 'adjustment', v_record.amount, v_current_balance, v_new_balance, 'Hủy phiếu chi: ' || v_record.description, v_record.ref_id, v_user_id);
                v_sync_msg := ' (Đã cập nhật lại công nợ khách)';
           END IF;
       END;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đã xóa giao dịch và hoàn tiền vào quỹ' || v_sync_msg);
END;
$$;

---------------------------------------------------------
-- 6. FIX import_inventory
---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_inventory(
    p_service_id uuid, 
    p_qty_buy numeric, 
    p_total_amount numeric, 
    p_payment_method_code text DEFAULT 'cash'::text, 
    p_shift_id uuid DEFAULT NULL::uuid, 
    p_notes text DEFAULT NULL::text, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_staff_id uuid;
  v_staff_name text;
  v_old_stock integer;
  v_old_cost numeric;
  v_new_stock integer;
  v_new_cost numeric;
  v_conversion_factor integer;
  v_qty_sell integer;
  v_transaction_id uuid;
  v_service_name text;
  v_unit_buy text;
  v_hotel_id uuid;
BEGIN
  v_hotel_id := public.fn_get_tenant_id();
  v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
  SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id AND hotel_id = v_hotel_id;

  SELECT name, COALESCE(stock_quantity, 0), COALESCE(cost_price, 0), COALESCE(conversion_factor, 1), unit_buy
  INTO v_service_name, v_old_stock, v_old_cost, v_conversion_factor, v_unit_buy
  FROM public.services WHERE id = p_service_id AND hotel_id = v_hotel_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Dịch vụ không tồn tại'; END IF;

  v_qty_sell := ROUND(p_qty_buy * v_conversion_factor);
  v_new_stock := v_old_stock + v_qty_sell;
  v_new_cost := CASE WHEN v_new_stock > 0 THEN ((v_old_stock * v_old_cost) + p_total_amount) / v_new_stock ELSE v_old_cost END;

  INSERT INTO public.transactions (hotel_id, type, staff_id, amount, reason, new_value)
  VALUES (v_hotel_id, 'IMPORT_INVENTORY', v_staff_id, p_total_amount, COALESCE(p_notes, 'Nhập kho: ' || v_service_name), 
  jsonb_build_object('service_id', p_service_id, 'qty_buy', p_qty_buy, 'new_cost', v_new_cost))
  RETURNING id INTO v_transaction_id;

  IF p_total_amount > 0 THEN 
      INSERT INTO public.cash_flow (hotel_id, flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, payment_method_code)
      VALUES (v_hotel_id, 'OUT', 'Nhập hàng', p_total_amount, 'Nhập kho: ' || v_service_name, now(), v_staff_id, v_staff_id, v_staff_name, v_transaction_id, LOWER(COALESCE(p_payment_method_code, 'cash')));
  END IF;

  UPDATE public.services SET stock_quantity = v_new_stock, cost_price = v_new_cost, updated_at = now() WHERE id = p_service_id AND hotel_id = v_hotel_id;

  INSERT INTO public.inventory_logs (hotel_id, service_id, type, quantity, balance_before, balance_after, reference_id, notes, created_by)
  VALUES (v_hotel_id, p_service_id, 'IMPORT', v_qty_sell, v_old_stock, v_new_stock, v_transaction_id, COALESCE(p_notes, ''), v_staff_id);

  RETURN json_build_object('status', 'success', 'new_stock', v_new_stock);
END;
$$;

---------------------------------------------------------
-- 7. FIX change_room
---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_room(p_booking_id uuid, p_new_room_id uuid, p_reason text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid, p_price_mode text DEFAULT 'USE_NEW'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_old_room_id uuid; v_new_room_status text; v_new_room_name text; v_old_room_name text; v_customer_id uuid; v_staff_id uuid; v_old_cat_id uuid; v_old_price_hourly numeric; v_old_price_daily numeric; v_old_price_overnight numeric; v_rental_type text; v_hotel_id uuid;
BEGIN
    v_hotel_id := public.fn_get_tenant_id();
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    SELECT room_id, customer_id, rental_type INTO v_old_room_id, v_customer_id, v_rental_type FROM public.bookings WHERE id = p_booking_id AND hotel_id = v_hotel_id;
    IF v_old_room_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;

    SELECT status, room_number INTO v_new_room_status, v_new_room_name FROM public.rooms WHERE id = p_new_room_id AND hotel_id = v_hotel_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Phòng mới không tồn tại'); END IF;
    IF v_new_room_status != 'available' THEN RETURN jsonb_build_object('success', false, 'message', 'Phòng mới không sẵn sàng'); END IF;

    SELECT room_number, category_id INTO v_old_room_name, v_old_cat_id FROM public.rooms WHERE id = v_old_room_id AND hotel_id = v_hotel_id;

    IF p_price_mode = 'KEEP_OLD' THEN
        SELECT price_hourly, price_daily, price_overnight INTO v_old_price_hourly, v_old_price_daily, v_old_price_overnight FROM public.room_categories WHERE id = v_old_cat_id AND hotel_id = v_hotel_id;
        UPDATE public.bookings SET custom_price = CASE WHEN v_rental_type = 'hourly' THEN v_old_price_hourly WHEN v_rental_type = 'overnight' THEN v_old_price_overnight ELSE v_old_price_daily END, custom_price_reason = 'Giữ giá cũ khi đổi phòng' WHERE id = p_booking_id AND hotel_id = v_hotel_id;
    ELSE
        UPDATE public.bookings SET custom_price = NULL, custom_price_reason = NULL WHERE id = p_booking_id AND hotel_id = v_hotel_id;
    END IF;

    UPDATE public.bookings SET room_id = p_new_room_id, notes = COALESCE(notes, '') || E'\n[' || now() || '] Đổi phòng từ ' || COALESCE(v_old_room_name, '???') || ' sang ' || v_new_room_name || '. Giá: ' || p_price_mode || '. Lý do: ' || COALESCE(p_reason, 'N/A') WHERE id = p_booking_id AND hotel_id = v_hotel_id;
    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_old_room_id AND hotel_id = v_hotel_id;
    UPDATE public.rooms SET status = 'occupied', current_booking_id = p_booking_id, updated_at = now() WHERE id = p_new_room_id AND hotel_id = v_hotel_id;

    INSERT INTO public.audit_logs (hotel_id, booking_id, customer_id, room_id, staff_id, explanation)
    VALUES (v_hotel_id, p_booking_id, v_customer_id, p_new_room_id, v_staff_id, jsonb_build_object('action', 'change_room', 'old_room', v_old_room_name, 'new_room', v_new_room_name, 'price_mode', p_price_mode, 'reason', p_reason));

    PERFORM public.fn_update_booking_snapshot(p_booking_id);
    RETURN jsonb_build_object('success', true, 'message', 'Đổi phòng thành công');
END;
$$;

---------------------------------------------------------
-- 8. FIX open_shift
---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_shift(staff_uuid uuid, initial_cash numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    new_shift_id UUID;
    last_shift_cash DECIMAL;
    v_hotel_id UUID;
BEGIN
    v_hotel_id := public.fn_get_tenant_id();
    IF EXISTS (SELECT 1 FROM public.shifts WHERE staff_id = staff_uuid AND status = 'open' AND hotel_id = v_hotel_id) THEN
        RAISE EXCEPTION 'Nhân viên đã có ca làm việc đang mở';
    END IF;
    
    SELECT end_cash INTO last_shift_cash FROM public.shifts WHERE status = 'closed' AND hotel_id = v_hotel_id ORDER BY closed_at DESC LIMIT 1;
    last_shift_cash := COALESCE(last_shift_cash, initial_cash, 0);
    
    INSERT INTO public.shifts (hotel_id, staff_id, start_cash, status)
    VALUES (v_hotel_id, staff_uuid, last_shift_cash, 'open')
    RETURNING id INTO new_shift_id;
    
    RETURN new_shift_id;
END;
$$;
