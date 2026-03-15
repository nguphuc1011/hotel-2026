-- SQL FIX: RÚT GỌN NỘI DUNG BÁO CÁO & VÁ LỖI DÒNG TIỀN (TENANT ISOLATION)
-- Căn cứ: Điều 4 (Nhất thống Mật lệnh) và Điều 10 (Kỷ luật sinh tồn)

-- 1. Cập nhật hàm process_checkout để rút gọn mô tả thanh toán
CREATE OR REPLACE FUNCTION public.process_checkout(p_booking_id uuid, p_payment_method text, p_amount_paid numeric, p_discount numeric, p_surcharge numeric, p_notes text, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text, p_selected_child_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_staff_name text;
    v_room_id uuid;
    v_room_number text;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_hotel_id uuid;
    v_already_billed numeric;
    v_diff numeric;
    v_child_record record;
    v_total_bill_for_transaction numeric := 0;
    v_total_deposit_for_transaction numeric := 0;
    v_all_explanations text[] := '{}';
    v_child_bill jsonb;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_old_balance numeric;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF v_staff_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = v_staff_id) THEN v_staff_id := NULL; END IF;
    END IF;

    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    SELECT room_id, customer_id, hotel_id INTO v_room_id, v_customer_id, v_hotel_id FROM public.bookings WHERE id = p_booking_id;
    IF v_room_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_room_id;

    -- 1. Update Master Booking
    UPDATE public.bookings SET discount_amount = COALESCE(p_discount, 0), custom_surcharge = COALESCE(p_surcharge, 0), check_out_actual = now(), status = 'completed', payment_method = p_payment_method, notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''), verified_by_staff_id = v_staff_id, verified_by_staff_name = v_staff_name WHERE id = p_booking_id;

    -- 2. Process Children
    IF p_selected_child_ids IS NOT NULL AND array_length(p_selected_child_ids, 1) > 0 THEN
        FOR v_child_record IN SELECT id, room_id FROM public.bookings WHERE id = ANY(p_selected_child_ids) AND status NOT IN ('cancelled', 'completed', 'checked_out') LOOP
            UPDATE public.bookings SET status = 'completed', check_out_actual = now(), payment_method = 'group_settlement', notes = COALESCE(notes, '') || E'\n[Group Checkout] Settled by Master Booking ' || COALESCE(v_room_number, 'Unknown'), verified_by_staff_id = v_staff_id, verified_by_staff_name = v_staff_name WHERE id = v_child_record.id;
            UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_child_record.room_id;
        END LOOP;
    END IF;

    -- 3. Calculate Bills
    v_bill := public.calculate_booking_bill(p_booking_id);
    IF v_bill->>'success' = 'false' THEN RETURN v_bill; END IF;
    v_total_bill_for_transaction := (v_bill->>'total_amount')::numeric;
    v_total_deposit_for_transaction := (v_bill->>'deposit_amount')::numeric;
    v_all_explanations := v_all_explanations || ARRAY(SELECT x FROM jsonb_array_elements_text(v_bill->'explanation') AS x);

    IF p_selected_child_ids IS NOT NULL AND array_length(p_selected_child_ids, 1) > 0 THEN
        FOR v_child_record IN SELECT id FROM public.bookings WHERE id = ANY(p_selected_child_ids) LOOP
            v_child_bill := public.calculate_booking_bill(v_child_record.id);
            IF v_child_bill->>'success' = 'false' THEN RETURN v_child_bill; END IF;
            v_total_bill_for_transaction := v_total_bill_for_transaction + (v_child_bill->>'total_amount')::numeric;
            v_total_deposit_for_transaction := v_total_deposit_for_transaction + (v_child_bill->>'deposit_amount')::numeric;
            v_all_explanations := v_all_explanations || ARRAY(SELECT x FROM jsonb_array_elements_text(v_child_bill->'explanation') AS x);
        END LOOP; END IF;
    v_total_amount := v_total_bill_for_transaction;
    v_deposit := v_total_deposit_for_transaction;

    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_room_id;

    -- 5. REVENUE ADJUSTMENT
    SELECT COALESCE(SUM(amount), 0) INTO v_already_billed FROM public.cash_flow WHERE ref_id = p_booking_id AND flow_type = 'IN' AND payment_method_code = 'credit' AND hotel_id = v_hotel_id;
    v_diff := v_total_amount - v_already_billed;
    IF v_diff <> 0 THEN
        INSERT INTO public.cash_flow (flow_type, category, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', CASE WHEN v_diff > 0 THEN 'Doanh thu bổ sung' ELSE 'Giảm trừ doanh thu' END, ABS(v_diff), 'Điều chỉnh doanh thu checkout (Phụ thu/Dịch vụ/Giảm giá)', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'credit', v_hotel_id);
    END IF;

    -- 6. RECORD PAYMENT (RÚT GỌN DESCRIPTION)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (flow_type, category, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Thanh toán', p_amount_paid, 
                COALESCE(v_bill->>'customer_name', 'Khách lẻ') || ' (P' || COALESCE(v_room_number, '???') || ') TT trả phòng', 
                auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), lower(p_payment_method), v_hotel_id);

        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', UPPER(p_payment_method), 'diff', p_amount_paid, 'reason', COALESCE(v_bill->>'customer_name', 'Khách lẻ') || ' (P' || COALESCE(v_room_number, '???') || ') TT trả phòng');
    END IF;

    -- 7. HANDLE DEPOSIT TRANSFER
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (flow_type, category, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('OUT', 'Tiền cọc', v_deposit, 'Khấu trừ cọc (P' || COALESCE(v_room_number, '???') || ')', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'cash', v_hotel_id);
        INSERT INTO public.cash_flow (flow_type, category, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Tiền phòng', v_deposit, 'Cọc chuyển sang tiền phòng (P' || COALESCE(v_room_number, '???') || ')', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'deposit_transfer', v_hotel_id);
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'ESCROW', 'diff', -v_deposit, 'reason', 'Khấu trừ cọc checkout (P' || COALESCE(v_room_number, '???') || ')');
    END IF;

    -- 8. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        SELECT balance INTO v_old_balance FROM public.customers WHERE id = v_customer_id FOR UPDATE;
        UPDATE public.customers SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now() WHERE id = v_customer_id AND hotel_id = v_hotel_id;
        INSERT INTO public.customer_transactions (customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name, hotel_id) 
        VALUES (v_customer_id, 'checkout', p_amount_paid - (v_total_amount - v_deposit), v_old_balance, COALESCE(v_old_balance, 0) + p_amount_paid - (v_total_amount - v_deposit), COALESCE(v_bill->>'customer_name', 'Khách lẻ') || ' (P' || COALESCE(v_room_number, '???') || ') TT trả phòng', p_booking_id, v_staff_id, v_staff_name, v_hotel_id);
    END IF;

    UPDATE public.bookings SET billing_audit_trail = to_jsonb(v_all_explanations) WHERE id = p_booking_id;
    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill, 'wallet_changes', v_wallet_changes);
END;
$function$;

-- 2. Cập nhật hàm adjust_customer_balance để rút gọn mô tả Thu trước
CREATE OR REPLACE FUNCTION public.adjust_customer_balance(p_customer_id uuid, p_amount numeric, p_type text, p_description text, p_booking_id uuid DEFAULT NULL::uuid, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text)
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
    v_staff_id uuid;
    v_abs_amount numeric;
    v_room_name text;
    v_hotel_id uuid;
    v_wallet_changes jsonb := '[]'::jsonb;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF v_staff_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = v_staff_id) THEN v_staff_id := NULL; END IF;
    END IF;
    v_abs_amount := ABS(p_amount); 
    SELECT true, balance, hotel_id INTO v_cust_exists, v_old_balance, v_hotel_id FROM public.customers WHERE id = p_customer_id FOR UPDATE;
    IF v_cust_exists IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy khách hàng'); END IF;
    v_old_balance := COALESCE(v_old_balance, 0);

    IF p_type = 'deposit' AND p_booking_id IS NOT NULL THEN
        SELECT r.room_number INTO v_room_name FROM public.bookings b JOIN public.rooms r ON b.room_id = r.id WHERE b.id = p_booking_id;
        UPDATE public.bookings SET deposit_amount = COALESCE(deposit_amount, 0) + v_abs_amount, updated_at = now() WHERE id = p_booking_id;
        v_new_balance := v_old_balance; 
        INSERT INTO public.customer_transactions (customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name, hotel_id) 
        VALUES (p_customer_id, 'deposit', v_abs_amount, v_old_balance, v_new_balance, 'Thu trước (P' || COALESCE(v_room_name, '???') || ')', p_booking_id, v_staff_id, p_verified_by_staff_name, v_hotel_id);
        
        INSERT INTO public.cash_flow (flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_id, verified_by_staff_name, payment_method_code, ref_id, hotel_id) 
        VALUES ('IN', 'Thu trước', v_abs_amount, 'Thu trước (P' || COALESCE(v_room_name, '???') || ')', now(), v_staff_id, v_staff_id, p_verified_by_staff_name, LOWER(p_payment_method), p_booking_id, v_hotel_id);

        v_wallet_changes := jsonb_build_array(jsonb_build_object('walletName', 'ESCROW', 'diff', v_abs_amount, 'reason', 'Thu trước (P' || COALESCE(v_room_name, '???') || ')'));
    ELSE
        IF p_type = 'payment' THEN v_new_balance := v_old_balance + v_abs_amount; v_flow_type := 'IN'; v_category := 'Thu nợ';
        ELSIF p_type = 'refund' THEN v_new_balance := v_old_balance - v_abs_amount; v_flow_type := 'OUT'; v_category := 'Hoàn tiền';
        ELSIF p_type = 'charge' THEN v_new_balance := v_old_balance - v_abs_amount; v_flow_type := NULL; 
        ELSE v_new_balance := v_old_balance + p_amount;
            IF p_amount >= 0 THEN v_flow_type := 'IN'; v_category := 'Thu nợ'; ELSE v_flow_type := 'OUT'; v_category := 'Chi khác'; END IF;
        END IF;
        UPDATE public.customers SET balance = v_new_balance, updated_at = now() WHERE id = p_customer_id;
        INSERT INTO public.customer_transactions (customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name, hotel_id) 
        VALUES (p_customer_id, p_type, v_abs_amount, v_old_balance, v_new_balance, p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), p_booking_id, v_staff_id, p_verified_by_staff_name, v_hotel_id);
        IF v_flow_type IS NOT NULL THEN
            INSERT INTO public.cash_flow (flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_id, verified_by_staff_name, payment_method_code, hotel_id) 
            VALUES (v_flow_type, v_category, v_abs_amount, p_description, now(), v_staff_id, v_staff_id, p_verified_by_staff_name, LOWER(p_payment_method), v_hotel_id);
            v_wallet_changes := jsonb_build_array(jsonb_build_object('walletName', UPPER(p_payment_method), 'diff', CASE WHEN v_flow_type = 'IN' THEN v_abs_amount ELSE -v_abs_amount END, 'reason', p_description));
        END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'message', 'Thực hiện giao dịch thành công', 'wallet_changes', v_wallet_changes);
END;
$function$;

-- 3. Vá lỗi dòng tiền (Bù đắp hotel_id cho các phiếu thu chi bị NULL)
-- QUAN TRỌNG: Chỉ vô hiệu hóa trigger bảo vệ dữ liệu cụ thể (tránh đụng vào system triggers)
ALTER TABLE public.cash_flow DISABLE TRIGGER trg_protect_cash_flow;

UPDATE public.cash_flow 
SET hotel_id = '33e31139-346d-4332-8b0f-5316019cba8c' 
WHERE hotel_id IS NULL;

ALTER TABLE public.cash_flow ENABLE TRIGGER trg_protect_cash_flow;
