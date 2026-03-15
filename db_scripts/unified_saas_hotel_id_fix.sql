-- BẢN VÁ TỔNG HỢP: FIX THIẾU HOTEL_ID & FIX FUNCTION NOT FOUND
-- Áp dụng cho hệ thống Multi-tenant (SaaS)

---------------------------------------------------------
-- 1. FIX HÀM ĐIỀU CHỈNH QUỸ (fn_adjust_wallet_balance)
-- Đảm bảo định nghĩa tham số khớp 100% với Frontend
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
    -- Lấy Hotel ID từ Context
    v_hotel_id := public.fn_get_tenant_id();
    IF v_hotel_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi bảo mật: Không xác định được định danh khách sạn.');
    END IF;

    -- Lấy thông tin nhân viên
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    -- Lấy số dư hiện tại và KHÓA dòng để tránh race condition
    SELECT balance INTO v_current_balance 
    FROM public.wallets 
    WHERE id = p_wallet_id AND hotel_id = v_hotel_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy quỹ: ' || p_wallet_id);
    END IF;

    -- Tính toán chênh lệch
    v_diff := p_actual_balance - v_current_balance;
    IF v_diff = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Số dư đã khớp, không cần điều chỉnh.');
    END IF;

    v_flow_type := CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END;

    -- Tạo giao dịch Cash Flow (Tự động cập nhật ví qua trigger)
    INSERT INTO public.cash_flow (
        hotel_id,
        flow_type,
        category,
        amount,
        description,
        occurred_at,
        created_by,
        verified_by_staff_id,
        verified_by_staff_name,
        payment_method_code,
        is_auto
    )
    VALUES (
        v_hotel_id,
        v_flow_type,
        'Điều chỉnh',
        ABS(v_diff),
        'Điều chỉnh số dư: ' || COALESCE(p_reason, '') || ' (Hệ thống: ' || v_current_balance || ', Thực tế: ' || p_actual_balance || ')',
        now(),
        v_staff_id,
        v_staff_id,
        v_staff_name,
        CASE WHEN p_wallet_id = 'CASH' THEN 'cash' ELSE 'bank' END,
        true
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Điều chỉnh số dư thành công', 
        'data', jsonb_build_object(
            'id', v_new_id,
            'diff', v_diff,
            'new_balance', p_actual_balance
        )
    );
END;
$$;

---------------------------------------------------------
-- 2. FIX HÀM TẠO YÊU CẦU DUYỆT (fn_create_approval_request)
-- Bổ sung hotel_id
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
    
    RETURN jsonb_build_object(
        'success', true, 
        'request_id', v_id,
        'approval_id', v_id
    );
END;
$$;

---------------------------------------------------------
-- 3. FIX HÀM HỦY GIAO DỊCH (fn_delete_cash_flow)
-- Bổ sung hotel_id cho giao dịch VOID
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

    -- Security Check
    SELECT public.fn_resolve_policy(v_user_id, 'finance_delete_transaction') INTO v_policy;
    IF v_policy = 'DENY' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bạn không có quyền Xóa giao dịch.');
    END IF;

    -- Get record info
    SELECT * INTO v_record FROM public.cash_flow WHERE id = p_id AND hotel_id = v_hotel_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Giao dịch không tồn tại.');
    END IF;
    
    IF COALESCE(v_record.is_auto, false) = true THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không thể xóa giao dịch tự động của hệ thống.');
    END IF;
    
    IF v_record.description LIKE 'VOID:%' THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không thể xóa giao dịch đã hủy.');
    END IF;

    -- Perform VOID
    INSERT INTO public.cash_flow (
        hotel_id, flow_type, category, amount, description, occurred_at, created_by, 
        ref_id, payment_method_code, customer_id, verified_by_staff_id, verified_by_staff_name
    )
    VALUES (
        v_hotel_id,
        v_record.flow_type,
        v_record.category,
        -v_record.amount,
        'VOID: ' || v_record.description || COALESCE(' - Lý do: ' || p_reason, ''),
        now(),
        v_user_id,
        v_record.id,
        v_record.payment_method_code,
        v_record.customer_id,
        p_verified_by_staff_id,
        p_verified_by_staff_name
    )
    RETURNING id INTO v_void_id;

    -- Cập nhật công nợ/tiền cọc (logic cũ giữ nguyên)
    v_cust_id := v_record.customer_id;
    IF v_cust_id IS NULL AND v_record.ref_id IS NOT NULL THEN
        SELECT customer_id INTO v_cust_id FROM public.bookings WHERE id = v_record.ref_id;
    END IF;

    IF v_cust_id IS NOT NULL THEN
       DECLARE
            v_current_balance numeric;
            v_new_balance numeric;
       BEGIN
           SELECT balance INTO v_current_balance FROM public.customers WHERE id = v_cust_id;
           v_current_balance := COALESCE(v_current_balance, 0);

           IF v_record.category = 'Tiền cọc' AND v_record.ref_id IS NOT NULL THEN
                UPDATE public.bookings SET deposit_amount = GREATEST(0, deposit_amount - v_record.amount) WHERE id = v_record.ref_id;
                v_sync_msg := ' (Đã cập nhật lại tiền cọc Booking)';
           ELSIF v_record.flow_type = 'IN' THEN
                v_new_balance := v_current_balance - v_record.amount;
                UPDATE public.customers SET balance = v_new_balance WHERE id = v_cust_id;
                INSERT INTO public.customer_transactions (hotel_id, customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by)
                VALUES (v_hotel_id, v_cust_id, 'adjustment', -v_record.amount, v_current_balance, v_new_balance, 'Hủy phiếu thu: ' || v_record.description, v_record.ref_id, v_user_id);
                v_sync_msg := ' (Đã cập nhật lại công nợ khách)';
           ELSIF v_record.flow_type = 'OUT' THEN
                v_new_balance := v_current_balance + v_record.amount;
                UPDATE public.customers SET balance = v_new_balance WHERE id = v_cust_id;
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
-- 4. FIX HÀM NHẬP KHO (import_inventory)
-- Bổ sung hotel_id cho Cash Flow và Inventory Log
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
  SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

  SELECT name, COALESCE(stock_quantity, 0), COALESCE(cost_price, 0), COALESCE(conversion_factor, 1), unit_buy
  INTO v_service_name, v_old_stock, v_old_cost, v_conversion_factor, v_unit_buy
  FROM public.services WHERE id = p_service_id AND hotel_id = v_hotel_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Dịch vụ không tồn tại'; END IF;

  v_qty_sell := ROUND(p_qty_buy * v_conversion_factor);
  v_new_stock := v_old_stock + v_qty_sell;
  v_new_cost := CASE WHEN v_new_stock > 0 THEN ((v_old_stock * v_old_cost) + p_total_amount) / v_new_stock ELSE v_old_cost END;

  -- Giao dịch nhập kho
  INSERT INTO public.transactions (hotel_id, type, staff_id, amount, reason, new_value)
  VALUES (v_hotel_id, 'IMPORT_INVENTORY', v_staff_id, p_total_amount, COALESCE(p_notes, 'Nhập kho: ' || v_service_name), 
  jsonb_build_object('service_id', p_service_id, 'qty_buy', p_qty_buy, 'new_cost', v_new_cost))
  RETURNING id INTO v_transaction_id;

  -- Ghi nhận Cash Flow
  IF p_total_amount > 0 THEN 
      INSERT INTO public.cash_flow (hotel_id, flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, payment_method_code)
      VALUES (v_hotel_id, 'OUT', 'Nhập hàng', p_total_amount, 'Nhập kho: ' || v_service_name, now(), v_staff_id, v_staff_id, v_staff_name, v_transaction_id, LOWER(COALESCE(p_payment_method_code, 'cash')));
  END IF;

  -- Cập nhật Kho
  UPDATE public.services SET stock_quantity = v_new_stock, cost_price = v_new_cost, updated_at = now() WHERE id = p_service_id;

  -- Log Kho
  INSERT INTO public.inventory_logs (hotel_id, service_id, type, quantity, balance_before, balance_after, reference_id, notes, created_by)
  VALUES (v_hotel_id, p_service_id, 'IMPORT', v_qty_sell, v_old_stock, v_new_stock, v_transaction_id, COALESCE(p_notes, ''), v_staff_id);

  RETURN json_build_object('status', 'success', 'new_stock', v_new_stock);
END;
$$;
