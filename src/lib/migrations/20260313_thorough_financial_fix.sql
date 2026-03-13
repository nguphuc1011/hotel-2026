-- MIGRATION: THỰC THI SỬA LỖI TRIỆT ĐỂ CHO CÁC RPC TÀI CHÍNH
-- TRÍCH DẪN HIẾN PHÁP:
-- ĐIỀU 10 (Kỷ luật sinh tồn): Trích dẫn 2 Điều Hiến pháp trước khi hành động.
-- ĐIỀU 12 (Thông báo biến động tài chính): Mọi biến động tài chính phải trả về wallet_changes.
-- ĐIỀU 3 (Chiến lược Dữ liệu Tối cao): Sử dụng hotel_id để tuân thủ RLS.

-- 1. Cập nhật RPC adjust_customer_balance
CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
    p_customer_id uuid, 
    p_amount numeric, 
    p_type text, 
    p_description text, 
    p_booking_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_name text DEFAULT NULL::text, 
    p_payment_method text DEFAULT 'cash'::text
)
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
    
    -- SAFETY: Check if staff_id exists in public.staff (Prevent FK violation)
    IF v_staff_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = v_staff_id) THEN
            v_staff_id := NULL; -- Fallback to NULL if staff doesn't exist
        END IF;
    END IF;
    
    v_abs_amount := ABS(p_amount); 

    -- Lấy hotel_id và balance cũ của khách hàng (Tuân thủ Rule 3)
    SELECT true, balance, hotel_id INTO v_cust_exists, v_old_balance, v_hotel_id
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF v_cust_exists IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy khách hàng');
    END IF;

    v_old_balance := COALESCE(v_old_balance, 0);

    IF p_type = 'deposit' AND p_booking_id IS NOT NULL THEN
        -- THU TRƯỚC CHO BOOKING
        SELECT r.room_number INTO v_room_name 
        FROM public.bookings b 
        JOIN public.rooms r ON b.room_id = r.id 
        WHERE b.id = p_booking_id;

        UPDATE public.bookings 
        SET deposit_amount = COALESCE(deposit_amount, 0) + v_abs_amount,
            updated_at = now()
        WHERE id = p_booking_id;
        
        v_new_balance := v_old_balance; 

        -- Insert có hotel_id (Tuân thủ RLS)
        INSERT INTO public.customer_transactions (
            customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name, hotel_id
        ) VALUES (
            p_customer_id, 'deposit', v_abs_amount, v_old_balance, v_new_balance, 
            p_description || ' (Phòng ' || COALESCE(v_room_name, '???') || ')', 
            p_booking_id, v_staff_id, p_verified_by_staff_name, v_hotel_id
        );
        
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_id, verified_by_staff_name, payment_method_code, ref_id, hotel_id
        ) VALUES (
            'IN', 'Thu trước', v_abs_amount,
            'Thu trước phòng ' || COALESCE(v_room_name, '???') || ': ' || p_description,
            now(), v_staff_id, v_staff_id, p_verified_by_staff_name, LOWER(p_payment_method), p_booking_id, v_hotel_id
        );

        -- Chuẩn bị wallet_changes (Rule 12)
        v_wallet_changes := jsonb_build_array(
            jsonb_build_object(
                'walletName', 'ESCROW',
                'diff', v_abs_amount,
                'reason', 'Thu trước phòng ' || COALESCE(v_room_name, '???')
            )
        );

    ELSE
        -- ĐIỀU CHỈNH SỐ DƯ TRỰC TIẾP
        IF p_type = 'payment' THEN
            v_new_balance := v_old_balance + v_abs_amount;
            v_flow_type := 'IN';
            v_category := 'Thu nợ';
        ELSIF p_type = 'refund' THEN
            v_new_balance := v_old_balance - v_abs_amount;
            v_flow_type := 'OUT';
            v_category := 'Hoàn tiền';
        ELSIF p_type = 'charge' THEN
            v_new_balance := v_old_balance - v_abs_amount;
            v_flow_type := NULL; 
        ELSE 
            v_new_balance := v_old_balance + p_amount;
            IF p_amount >= 0 THEN
                 v_flow_type := 'IN';
                 v_category := 'Thu nợ';
            ELSE
                 v_flow_type := 'OUT';
                 v_category := 'Chi khác';
            END IF;
        END IF;

        UPDATE public.customers SET balance = v_new_balance, updated_at = now() WHERE id = p_customer_id;

        INSERT INTO public.customer_transactions (
            customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name, hotel_id
        ) VALUES (
            p_customer_id, p_type, v_abs_amount, v_old_balance, v_new_balance, 
            p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
            p_booking_id, v_staff_id, p_verified_by_staff_name, v_hotel_id
        );

        IF v_flow_type IS NOT NULL THEN
            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_id, verified_by_staff_name, payment_method_code, hotel_id
            ) VALUES (
                v_flow_type, v_category, v_abs_amount,
                p_description || ' [Điều chỉnh số dư]',
                now(), v_staff_id, v_staff_id, p_verified_by_staff_name, LOWER(p_payment_method), v_hotel_id
            );
            
            -- Chuẩn bị wallet_changes (Rule 12)
            v_wallet_changes := jsonb_build_array(
                jsonb_build_object(
                    'walletName', UPPER(p_payment_method),
                    'diff', CASE WHEN v_flow_type = 'IN' THEN v_abs_amount ELSE -v_abs_amount END,
                    'reason', p_description
                )
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'new_balance', v_new_balance, 
        'message', 'Thực hiện giao dịch thành công',
        'wallet_changes', v_wallet_changes
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- 2. Cập nhật RPC check_in_customer (Thêm wallet_changes và đảm bảo hotel_id)
CREATE OR REPLACE FUNCTION public.check_in_customer(
    p_room_id uuid, 
    p_rental_type text, 
    p_customer_id uuid DEFAULT NULL::uuid, 
    p_deposit numeric DEFAULT 0, 
    p_services jsonb DEFAULT '[]'::jsonb, 
    p_customer_name text DEFAULT NULL::text, 
    p_extra_adults integer DEFAULT 0, 
    p_extra_children integer DEFAULT 0, 
    p_notes text DEFAULT NULL::text, 
    p_custom_price numeric DEFAULT NULL::numeric, 
    p_custom_price_reason text DEFAULT NULL::text, 
    p_source text DEFAULT 'direct'::text, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_name text DEFAULT NULL::text, 
    p_payment_method text DEFAULT 'cash'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_booking_id uuid;
    v_customer_id uuid := p_customer_id;
    v_staff_id uuid;
    v_staff_name text;
    v_room_status text;
    v_room_number text;
    v_hotel_id uuid;
    v_initial_amount numeric := 0;
    v_pm_code text := lower(COALESCE(p_payment_method, 'cash'));
    v_wallet_changes jsonb := '[]'::jsonb;
BEGIN
    -- 1. Identify Staff and Hotel
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    
    -- SAFETY: Check if staff_id exists in public.staff (Prevent FK violation)
    IF v_staff_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = v_staff_id) THEN
            v_staff_id := NULL; -- Fallback to NULL if staff doesn't exist
        END IF;
    END IF;

    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    
    SELECT hotel_id, room_number, status INTO v_hotel_id, v_room_number, v_room_status 
    FROM public.rooms WHERE id = p_room_id;

    IF v_room_status = 'occupied' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách');
    END IF;

    -- 2. Handle Customer
    IF v_customer_id IS NULL AND p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name, hotel_id) 
        VALUES (p_customer_name, v_hotel_id) 
        RETURNING id INTO v_customer_id;
    END IF;

    -- 3. Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, status, 
        deposit_amount, adult_count, child_count, extra_adults, extra_children,
        notes, custom_price, custom_price_reason, source, hotel_id,
        check_in_actual, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, 'checked_in',
        p_deposit, 0, 0, p_extra_adults, p_extra_children,
        p_notes, p_custom_price, p_custom_price_reason, p_source, v_hotel_id,
        now(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name)
    ) RETURNING id INTO v_booking_id;

    -- 4. Update Room Status
    UPDATE public.rooms 
    SET 
        status = 'occupied', 
        current_booking_id = v_booking_id, 
        last_status_change = now(),
        updated_at = now() 
    WHERE id = p_room_id;

    -- 5. ACCRUAL REVENUE: Record initial room charge (Credit)
    v_initial_amount := COALESCE(p_custom_price, 0); 
    
    IF v_initial_amount > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            payment_method_code, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, occurred_at, hotel_id
        ) VALUES (
            'IN', 'Tiền phòng', v_initial_amount, 
            format('Ghi nhận doanh thu & nợ phòng (%s) lúc nhận phòng', p_rental_type), 
            'credit', auth.uid(), v_staff_id, 
            COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now(), v_hotel_id
        );
    END IF;

    -- 6. Record Deposit (If any)
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            payment_method_code, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, occurred_at, hotel_id
        ) VALUES (
            'IN', 'Tiền cọc', p_deposit, 
            'Tiền cọc phòng ' || COALESCE(v_room_number, ''), 
            v_pm_code, auth.uid(), v_staff_id, 
            COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now(), v_hotel_id
        );

        -- Rule 12: Notification
        v_wallet_changes := jsonb_build_array(
            jsonb_build_object(
                'walletName', 'ESCROW',
                'diff', p_deposit,
                'reason', 'Tiền cọc nhận phòng ' || COALESCE(v_room_number, '')
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'booking_id', v_booking_id, 
        'message', 'Nhận phòng thành công',
        'wallet_changes', v_wallet_changes
    );
END;
$function$;

-- 3. Cập nhật RPC process_checkout (Thêm wallet_changes, customer history và hotel_id)
CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid, 
    p_payment_method text, 
    p_amount_paid numeric, 
    p_discount numeric, 
    p_surcharge numeric, 
    p_notes text, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_name text DEFAULT NULL::text, 
    p_selected_child_ids uuid[] DEFAULT NULL::uuid[]
)
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
    -- Identify Staff
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    
    -- SAFETY: Check if staff_id exists in public.staff (Prevent FK violation)
    IF v_staff_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = v_staff_id) THEN
            v_staff_id := NULL; -- Fallback to NULL if staff doesn't exist
        END IF;
    END IF;

    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    -- Get Booking Info
    SELECT room_id, customer_id, hotel_id INTO v_room_id, v_customer_id, v_hotel_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Get Room Number
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_room_id;

    -- 1. Update Master Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = v_staff_id,
        verified_by_staff_name = v_staff_name
    WHERE id = p_booking_id;

    -- 2. Process Children if any
    IF p_selected_child_ids IS NOT NULL AND array_length(p_selected_child_ids, 1) > 0 THEN
        FOR v_child_record IN 
            SELECT id, room_id 
            FROM public.bookings 
            WHERE id = ANY(p_selected_child_ids) 
              AND status NOT IN ('cancelled', 'completed', 'checked_out')
        LOOP
            UPDATE public.bookings 
            SET 
                status = 'completed',
                check_out_actual = now(),
                payment_method = 'group_settlement',
                notes = COALESCE(notes, '') || E'\n[Group Checkout] Settled by Master Booking ' || COALESCE(v_room_number, 'Unknown'),
                verified_by_staff_id = v_staff_id,
                verified_by_staff_name = v_staff_name
            WHERE id = v_child_record.id;

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
        END LOOP;
    END IF;

    v_total_amount := v_total_bill_for_transaction;
    v_deposit := v_total_deposit_for_transaction;

    -- 4. Update Master Room Status
    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_room_id;

    -- 5. REVENUE ADJUSTMENT (Accrual Basis)
    SELECT COALESCE(SUM(amount), 0) INTO v_already_billed
    FROM public.cash_flow
    WHERE ref_id = p_booking_id AND flow_type = 'IN' AND payment_method_code = 'credit' AND hotel_id = v_hotel_id;

    v_diff := v_total_amount - v_already_billed;
    IF v_diff <> 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, verified_by_staff_id, verified_by_staff_name,
            ref_id, is_auto, occurred_at, payment_method_code, hotel_id
        ) VALUES (
            'IN', CASE WHEN v_diff > 0 THEN 'Doanh thu bổ sung' ELSE 'Giảm trừ doanh thu' END,
            ABS(v_diff), 'Điều chỉnh doanh thu checkout (Phụ thu/Dịch vụ/Giảm giá)',
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'credit', v_hotel_id
        );
    END IF;

    -- 6. RECORD PAYMENT (Settlement)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, verified_by_staff_id, verified_by_staff_name,
            ref_id, is_auto, occurred_at, payment_method_code, hotel_id
        ) VALUES (
            'IN', 'Thanh toán', p_amount_paid, 
            'Thanh toán checkout phòng ' || COALESCE(v_room_number, '') || ' - ' || COALESCE(v_bill->>'customer_name', 'Khách lẻ'), 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), lower(p_payment_method), v_hotel_id
        );

        -- Rule 12: Notification
        v_wallet_changes := v_wallet_changes || jsonb_build_object(
            'walletName', UPPER(p_payment_method),
            'diff', p_amount_paid,
            'reason', 'Thanh toán checkout phòng ' || COALESCE(v_room_number, '')
        );
    END IF;

    -- 7. HANDLE DEPOSIT TRANSFER
    IF v_deposit > 0 THEN
        -- OUT from Escrow
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, verified_by_staff_id, verified_by_staff_name,
            ref_id, is_auto, occurred_at, payment_method_code, hotel_id
        ) VALUES (
            'OUT', 'Tiền cọc', v_deposit, 'Khấu trừ tiền cọc vào tiền phòng', 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'cash', v_hotel_id
        );

        -- IN as transfer
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, verified_by_staff_id, verified_by_staff_name,
            ref_id, is_auto, occurred_at, payment_method_code, hotel_id
        ) VALUES (
            'IN', 'Tiền phòng', v_deposit, 'Tiền cọc chuyển sang tiền phòng', 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'deposit_transfer', v_hotel_id
        );

        -- Rule 12: Notification
        v_wallet_changes := v_wallet_changes || jsonb_build_object(
            'walletName', 'ESCROW',
            'diff', -v_deposit,
            'reason', 'Khấu trừ tiền cọc checkout ' || COALESCE(v_room_number, '')
        );
    END IF;

    -- 8. Update Customer Balance & History
    IF v_customer_id IS NOT NULL THEN
        SELECT balance INTO v_old_balance FROM public.customers WHERE id = v_customer_id FOR UPDATE;
        
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id AND hotel_id = v_hotel_id;

        -- Ghi log lịch sử cho khách hàng (Quan trọng cho đối soát)
        INSERT INTO public.customer_transactions (
            customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name, hotel_id
        ) VALUES (
            v_customer_id, 'checkout', p_amount_paid - (v_total_amount - v_deposit), 
            v_old_balance, COALESCE(v_old_balance, 0) + p_amount_paid - (v_total_amount - v_deposit),
            'Thanh toán checkout phòng ' || COALESCE(v_room_number, ''),
            p_booking_id, v_staff_id, v_staff_name, v_hotel_id
        );
    END IF;

    -- 9. Audit Trail
    UPDATE public.bookings SET billing_audit_trail = to_jsonb(v_all_explanations) WHERE id = p_booking_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Check-out thành công', 
        'bill', v_bill,
        'wallet_changes', v_wallet_changes
    );
END;
$function$;
