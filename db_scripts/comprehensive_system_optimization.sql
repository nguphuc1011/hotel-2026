-- ==============================================================================
-- COMPREHENSIVE SYSTEM OPTIMIZATION & BUSINESS LOGIC HARMONIZATION
-- Date: 2026-11-01
-- Description:
-- 1. Drops 9 duplicate/overloaded function signatures to prevent PGRST203.
-- 2. Drops duplicate trigger tr_expected_revenue_services to prevent double ledger calculation.
-- 3. Drops legacy dead functions (update_system_settings, get_settings, trg_update_wallets_dml, fn_apply_wallet_logic).
-- 4. Updates check_in_customer to automatically register initial services & deduct inventory.
-- 5. Updates process_checkout to checkout selected group children and auto-detach unselected ones.
-- 6. Updates fn_calculate_room_charge, fn_calculate_surcharge, fn_calculate_bill_adjustments to read settings by hotel_id.
-- 7. Updates cancel_booking and fn_reverse_cash_flow_on_cancel to include hotel_id and category_id.
-- 8. Updates fn_perform_night_audit with advisory locks to prevent concurrent double execution.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DROP OVERLOADS & OBSOLETE FUNCTIONS
-- ------------------------------------------------------------------------------

-- 1.1. change_room: Drop 4-arg variant, keep 5-arg variant with defaults
DROP FUNCTION IF EXISTS public.change_room(uuid, uuid, text, uuid);

-- 1.2. fn_create_cash_flow: Drop 10-arg variant, keep 11-arg variant (with p_category_id)
DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamptz, uuid, text, text, uuid, boolean);

-- 1.3. get_system_settings: Drop 0-arg variant, keep 1-arg variant (with p_hotel_id uuid)
DROP FUNCTION IF EXISTS public.get_system_settings();

-- 1.4. fn_get_all_user_floors_map: Drop 0-arg variant, keep 1-arg variant
DROP FUNCTION IF EXISTS public.fn_get_all_user_floors_map();

-- 1.5. fn_get_available_floors: Drop 0-arg variant, keep 1-arg variant
DROP FUNCTION IF EXISTS public.fn_get_available_floors();

-- 1.6. open_shift: Drop 2-arg variant, keep 3-arg variant (with p_hotel_id uuid)
DROP FUNCTION IF EXISTS public.open_shift(uuid, numeric);

-- 1.7. close_shift: Drop broken Variant 2, keep clean Variant 1
DROP FUNCTION IF EXISTS public.close_shift(uuid, jsonb, text, numeric);

-- 1.8. get_last_shift_balance: Drop 0-arg variant, keep 1-arg variant
DROP FUNCTION IF EXISTS public.get_last_shift_balance();

-- 1.9. fn_get_recorded_expected_revenue: Drop 1-arg variant, keep 2-arg variant with default
DROP FUNCTION IF EXISTS public.fn_get_recorded_expected_revenue(uuid);

-- 1.10. Drop duplicate trigger and function on booking_services
DROP TRIGGER IF EXISTS tr_expected_revenue_services ON public.booking_services;
DROP FUNCTION IF EXISTS public.trg_expected_revenue_services();

-- 1.11. Drop dead legacy functions
DROP FUNCTION IF EXISTS public.update_system_settings(jsonb);
DROP FUNCTION IF EXISTS public.get_settings();
DROP FUNCTION IF EXISTS public.trg_update_wallets_dml();
DROP FUNCTION IF EXISTS public.fn_apply_wallet_logic(record, integer);

-- ------------------------------------------------------------------------------
-- 2. UPDATE check_in_customer (Process Initial Services & Deduct Inventory)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, text, jsonb, text, integer, integer, text, numeric, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.check_in_customer(
    p_room_id uuid,
    p_rental_type text,
    p_customer_id uuid,
    p_deposit numeric,
    p_payment_method text,
    p_services jsonb,
    p_customer_name text,
    p_extra_adults integer,
    p_extra_children integer,
    p_notes text,
    p_custom_price numeric,
    p_custom_price_reason text,
    p_source text,
    p_verified_by_staff_id uuid,
    p_verified_by_staff_name text
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
    v_pm_code text := lower(COALESCE(p_payment_method, 'cash'));
    v_wallet_changes jsonb := '[]'::jsonb;
    v_cat_id uuid;
    v_svc jsonb;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    SELECT hotel_id, room_number, status INTO v_hotel_id, v_room_number, v_room_status FROM public.rooms WHERE id = p_room_id;

    IF v_room_status = 'occupied' THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách'); 
    END IF;

    IF v_customer_id IS NULL AND p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name, hotel_id) 
        VALUES (p_customer_name, v_hotel_id) 
        RETURNING id INTO v_customer_id;
    END IF;

    -- 1. Tạo Booking (Trigger sẽ tự động tạo cash_flow Tiền phòng)
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, status, deposit_amount, 
        adult_count, child_count, extra_adults, extra_children, 
        notes, custom_price, custom_price_reason, source, hotel_id, 
        check_in_actual, verified_by_staff_id, verified_by_staff_name
    )
    VALUES (
        p_room_id, v_customer_id, p_rental_type, 'checked_in', p_deposit, 
        0, 0, p_extra_adults, p_extra_children, 
        p_notes, p_custom_price, p_custom_price_reason, p_source, v_hotel_id, 
        now(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name)
    )
    RETURNING id INTO v_booking_id;

    -- 2. Cập nhật phòng sang occupied
    UPDATE public.rooms 
    SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = now(), updated_at = now() 
    WHERE id = p_room_id;

    -- 3. Xử lý Dịch vụ ban đầu (Minibar/Nước uống) nếu được chọn
    IF p_services IS NOT NULL AND jsonb_typeof(p_services) = 'array' AND jsonb_array_length(p_services) > 0 THEN
        FOR v_svc IN SELECT * FROM jsonb_array_elements(p_services)
        LOOP
            IF (v_svc->>'id') IS NOT NULL AND COALESCE((v_svc->>'quantity')::integer, 0) > 0 THEN
                PERFORM public.register_service_usage(
                    v_booking_id, 
                    (v_svc->>'id')::uuid, 
                    (v_svc->>'quantity')::integer
                );
            END IF;
        END LOOP;
    END IF;

    -- 4. Ghi nhận Tiền cọc (Nếu có)
    IF p_deposit > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'DEPOSIT' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (
            flow_type, category, category_id, amount, description, 
            payment_method_code, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, occurred_at, hotel_id
        )
        VALUES (
            'IN', 'Tiền cọc', v_cat_id, p_deposit, 'Tiền cọc phòng ' || COALESCE(v_room_number, ''), 
            v_pm_code, auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), 
            v_booking_id, true, now(), v_hotel_id
        );

        v_wallet_changes := jsonb_build_array(jsonb_build_object(
            'walletName', UPPER(v_pm_code), 
            'diff', p_deposit, 
            'reason', 'Tiền cọc nhận phòng ' || COALESCE(v_room_number, '')
        ));
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'booking_id', v_booking_id, 
        'message', 'Nhận phòng thành công', 
        'wallet_changes', v_wallet_changes
    );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3. UPDATE process_checkout (Checklist Group Checkout & Auto-detach)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid, text, uuid[]);

CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid,
    p_payment_method text,
    p_amount_paid numeric,
    p_discount numeric,
    p_surcharge numeric,
    p_notes text,
    p_verified_by_staff_id uuid,
    p_verified_by_staff_name text,
    p_selected_child_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_staff_id uuid;
    v_staff_name text;
    v_room_id uuid;
    v_room_number text;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_hotel_id uuid;
    v_cat_id uuid;
    v_remaining_unpaid numeric;
    v_bill jsonb;
    v_cust_bal_before numeric;
    v_cust_bal_after numeric;
    v_net_change numeric;
    v_parent_id uuid;
    v_child_rec record;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF p_verified_by_staff_name IS NULL THEN 
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id; 
    ELSE 
        v_staff_name := p_verified_by_staff_name; 
    END IF;

    SELECT room_id, customer_id, hotel_id, parent_booking_id 
    INTO v_room_id, v_customer_id, v_hotel_id, v_parent_id 
    FROM public.bookings WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); 
    END IF;
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_room_id;

    -- Nếu là phòng con tự thanh toán riêng -> tự gỡ khỏi nhóm
    IF v_parent_id IS NOT NULL THEN
        UPDATE public.bookings SET parent_booking_id = NULL WHERE id = p_booking_id;
    END IF;

    -- 1. Cập nhật Booking chính
    UPDATE public.bookings 
    SET discount_amount = COALESCE(p_discount, 0), 
        custom_surcharge = COALESCE(p_surcharge, 0), 
        check_out_actual = now(), 
        status = 'completed', 
        payment_method = p_payment_method, 
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''), 
        verified_by_staff_id = v_staff_id, 
        verified_by_staff_name = v_staff_name 
    WHERE id = p_booking_id;

    -- 2. Giải phóng phòng chính
    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_room_id;

    -- 3. Xử lý các phòng con trong nhóm (Group Checkout)
    IF p_selected_child_ids IS NOT NULL AND array_length(p_selected_child_ids, 1) > 0 THEN
        -- Check out tất cả các phòng con được tích chọn
        FOR v_child_rec IN 
            SELECT b.id, b.room_id, r.room_number
            FROM public.bookings b
            JOIN public.rooms r ON b.room_id = r.id
            WHERE b.parent_booking_id = p_booking_id
              AND b.id = ANY(p_selected_child_ids)
              AND b.status NOT IN ('cancelled', 'completed')
        LOOP
            UPDATE public.bookings 
            SET status = 'completed',
                check_out_actual = now(),
                payment_method = 'group_settlement',
                notes = COALESCE(notes, '') || E'\n[Group Checkout] Thanh toán chung theo phòng chủ P.' || COALESCE(v_room_number, 'Unknown'),
                verified_by_staff_id = v_staff_id,
                verified_by_staff_name = v_staff_name
            WHERE id = v_child_rec.id;

            UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_child_rec.room_id;
        END LOOP;

        -- Tự động tách các phòng con KHÔNG được tích chọn để phòng chủ không còn bị vướng
        UPDATE public.bookings
        SET parent_booking_id = NULL,
            notes = COALESCE(notes, '') || E'\n[Group Detach] Tách nhóm do phòng chủ đã trả phòng.'
        WHERE parent_booking_id = p_booking_id
          AND id != ALL(p_selected_child_ids)
          AND status NOT IN ('cancelled', 'completed');
    END IF;

    -- 4. Lấy Bill sau khi cập nhật
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 5. Ghi nhận Thanh toán tiền mặt/chuyển khoản
    IF p_amount_paid > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'SETTLEMENT' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (
            flow_type, category, category_id, amount, description, 
            created_by, verified_by_staff_id, verified_by_staff_name, 
            ref_id, is_auto, occurred_at, payment_method_code, hotel_id
        ) 
        VALUES (
            'IN', 'Thanh toán', v_cat_id, p_amount_paid, 
            'Thanh toán Checkout phòng P.' || COALESCE(v_room_number, '???'), 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), lower(p_payment_method), v_hotel_id
        );
    END IF;

    -- 6. Ghi nhận Chuyển cọc
    IF v_deposit > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'DEPOSIT_TRANSFER' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (
            flow_type, category, category_id, amount, description, 
            created_by, verified_by_staff_id, verified_by_staff_name, 
            ref_id, is_auto, occurred_at, payment_method_code, hotel_id
        ) 
        VALUES (
            'IN', 'Chuyển cọc', v_cat_id, v_deposit, 
            'Cọc chuyển sang tiền phòng (P.' || COALESCE(v_room_number, '???') || ')', 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'deposit_transfer', v_hotel_id
        );
    END IF;

    -- 7. Xử lý nợ tồn đọng hoặc tiền thừa
    v_remaining_unpaid := v_total_amount - v_deposit - p_amount_paid;
    IF v_remaining_unpaid > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'DEBT_TRANSFER' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (
            flow_type, category, category_id, amount, description, 
            created_by, verified_by_staff_id, verified_by_staff_name, 
            ref_id, is_auto, occurred_at, payment_method_code, hotel_id
        ) 
        VALUES (
            'IN', 'Kết chuyển nợ', v_cat_id, v_remaining_unpaid, 
            'Chuyển nợ phòng P.' || COALESCE(v_room_number, '???') || ' sang nợ khách cũ', 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'debt_transfer', v_hotel_id
        );
    ELSIF v_remaining_unpaid < 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'REFUND' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (
            flow_type, category, category_id, amount, description, 
            created_by, verified_by_staff_id, verified_by_staff_name, 
            ref_id, is_auto, occurred_at, payment_method_code, hotel_id
        ) 
        VALUES (
            'OUT', 'Hoàn tiền', v_cat_id, ABS(v_remaining_unpaid), 
            'Thối tiền thừa cho khách (P.' || COALESCE(v_room_number, '???') || ')', 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), lower(p_payment_method), v_hotel_id
        );
    END IF;

    -- 8. Cập nhật số dư khách hàng & ghi nhận vào customer_transactions
    IF v_customer_id IS NOT NULL THEN
        SELECT COALESCE(balance, 0) INTO v_cust_bal_before FROM public.customers WHERE id = v_customer_id AND hotel_id = v_hotel_id;
        v_net_change := p_amount_paid - (v_total_amount - v_deposit);
        v_cust_bal_after := v_cust_bal_before + v_net_change;

        UPDATE public.customers 
        SET balance = v_cust_bal_after, updated_at = now() 
        WHERE id = v_customer_id AND hotel_id = v_hotel_id;

        IF v_net_change <> 0 THEN
            INSERT INTO public.customer_transactions (
                customer_id, 
                type, 
                amount, 
                balance_before, 
                balance_after, 
                description, 
                booking_id, 
                verified_by_staff_id, 
                verified_by_staff_name, 
                hotel_id
            ) VALUES (
                v_customer_id, 
                (CASE WHEN v_net_change < 0 THEN 'charge' ELSE 'payment' END),
                ABS(v_net_change),
                v_cust_bal_before,
                v_cust_bal_after,
                'Check-out phòng P.' || COALESCE(v_room_number, '???') || (CASE WHEN v_net_change < 0 THEN ' (Khách nợ lại: ' || public.fn_format_money_vi(ABS(v_net_change)) || ')' ELSE ' (Dư tiền: ' || public.fn_format_money_vi(v_net_change) || ')' END),
                p_booking_id,
                v_staff_id,
                v_staff_name,
                v_hotel_id
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4. UPDATE cancel_booking & fn_reverse_cash_flow_on_cancel (Retain hotel_id & category_id)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cancel_booking(uuid, uuid, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.cancel_booking(
    p_booking_id uuid,
    p_verified_by_staff_id uuid,
    p_verified_by_staff_name text,
    p_penalty_amount numeric,
    p_penalty_payment_method text,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_room_id uuid;
    v_status text;
    v_hotel_id uuid;
    v_reversal_report jsonb;
    v_penalty_id uuid;
    v_room_name text;
    v_cat_id uuid;
BEGIN
    -- 1. Kiểm tra trạng thái Booking
    SELECT room_id, status, hotel_id INTO v_room_id, v_status, v_hotel_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking không tồn tại');
    END IF;

    IF v_status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking đã bị hủy trước đó');
    END IF;
    
    SELECT room_number INTO v_room_name FROM public.rooms WHERE id = v_room_id;

    -- 2. THỰC THI BÚT TOÁN ĐẢO (Bằng chứng thép)
    v_reversal_report := public.fn_reverse_cash_flow_on_cancel(p_booking_id);

    IF NOT (v_reversal_report->>'success')::boolean THEN
        RETURN v_reversal_report;
    END IF;

    -- 3. XỬ LÝ TIỀN PHẠT (Nếu có)
    IF p_penalty_amount > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories 
        WHERE (system_code = 'PENALTY' OR category = 'Phạt hủy phòng') 
          AND (hotel_id = v_hotel_id OR hotel_id IS NULL)
        ORDER BY hotel_id NULLS LAST LIMIT 1;

        INSERT INTO public.cash_flow (
            ref_id,
            flow_type,
            category,
            category_id,
            amount,
            payment_method_code,
            description,
            created_by,
            verified_by_staff_id,
            verified_by_staff_name,
            hotel_id,
            occurred_at
        ) VALUES (
            p_booking_id,
            'IN',
            'Phạt hủy phòng',
            v_cat_id,
            p_penalty_amount,
            LOWER(COALESCE(p_penalty_payment_method, 'cash')),
            'Tiền phạt hủy phòng P.' || COALESCE(v_room_name, '') || '. Lý do: ' || COALESCE(p_reason, 'Không có'),
            auth.uid(),
            p_verified_by_staff_id,
            p_verified_by_staff_name,
            v_hotel_id,
            now()
        ) RETURNING id INTO v_penalty_id;
    END IF;

    -- 4. Cập nhật trạng thái Booking
    UPDATE public.bookings
    SET
        status = 'cancelled',
        verified_by_staff_id = p_verified_by_staff_id,
        verified_by_staff_name = p_verified_by_staff_name,
        notes = COALESCE(notes, '') || CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN E'\n[Lý do hủy] ' || p_reason ELSE '' END
    WHERE id = p_booking_id;

    -- 5. Giải phóng phòng
    IF v_room_id IS NOT NULL THEN
        UPDATE public.rooms
        SET
            status = 'available',
            current_booking_id = NULL,
            last_status_change = now()
        WHERE id = v_room_id;
    END IF;

    -- 6. Log Audit
    INSERT INTO public.audit_logs (hotel_id, booking_id, room_id, staff_id, explanation)
    VALUES (
        v_hotel_id,
        p_booking_id, 
        v_room_id, 
        COALESCE(p_verified_by_staff_id, auth.uid()), 
        jsonb_build_object(
            'action', 'cancel_booking',
            'room_name', v_room_name,
            'penalty_amount', p_penalty_amount,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Hủy phòng thành công' || CASE WHEN p_penalty_amount > 0 THEN ' (Đã thu phạt ' || public.fn_format_money_vi(p_penalty_amount) || ')' ELSE '' END,
        'reversal', v_reversal_report,
        'penalty_id', v_penalty_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống khi hủy phòng: ' || SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reverse_cash_flow_on_cancel(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    r RECORD;
    v_reversed_count int := 0;
    v_total_reversed numeric := 0;
BEGIN
    FOR r IN 
        SELECT id, amount, payment_method_code, description, created_by, 
               verified_by_staff_id, verified_by_staff_name, hotel_id, category_id
        FROM public.cash_flow 
        WHERE ref_id = p_booking_id AND flow_type = 'IN'
    LOOP
        INSERT INTO public.cash_flow (
            ref_id,
            flow_type,
            category,
            category_id,
            amount,
            payment_method_code,
            description,
            created_by,
            verified_by_staff_id,
            verified_by_staff_name,
            hotel_id,
            occurred_at
        ) VALUES (
            p_booking_id,
            'OUT',
            'Hoàn tiền hủy phòng',
            r.category_id,
            r.amount,
            r.payment_method_code,
            'Bút toán đảo cho giao dịch #' || r.id || ': ' || r.description,
            r.created_by,
            r.verified_by_staff_id,
            r.verified_by_staff_name,
            r.hotel_id,
            now()
        );
        
        v_reversed_count := v_reversed_count + 1;
        v_total_reversed := v_total_reversed + r.amount;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'reversed_count', v_reversed_count, 
        'total_reversed', v_total_reversed
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 5. UPDATE fn_calculate_room_charge (Settings per Hotel ID)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_calculate_room_charge(uuid, timestamp with time zone, timestamp with time zone, text, uuid);

CREATE OR REPLACE FUNCTION public.fn_calculate_room_charge(
    p_booking_id uuid,
    p_check_in timestamp with time zone,
    p_check_out timestamp with time zone,
    p_rental_type text,
    p_room_cat_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_hotel_id uuid;
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_grace_minutes int;
    v_hourly_unit int;
    v_base_block_count int;
    v_ceiling_enabled boolean;
    v_ceiling_percent numeric;
    v_overnight_start time;
    v_overnight_end time;
    v_std_check_out time;
    v_full_day_cutoff time;
    v_full_day_early_cutoff time;
    v_auto_overnight_switch boolean;
    v_auto_full_day_early boolean;
    v_auto_full_day_late boolean;
    
    v_price_hourly numeric;
    v_price_next numeric;
    v_price_daily numeric;
    v_price_overnight numeric;
    v_overnight_enabled boolean;
    v_custom_price numeric;
   
    v_duration_minutes numeric;
    v_total_charge numeric := 0;
    v_explanations text[] := '{}';
    v_ceiling_amount numeric;
   
    v_first_block_min numeric;
    v_remaining_min numeric;
    v_next_blocks int := 0;
    v_check_in_time time;
    v_rental_type_actual text := p_rental_type;
    v_tz text := 'Asia/Ho_Chi_Minh';
    v_units numeric := 0;
    v_duration_text text := '';
BEGIN
    -- 0. Xác định hotel_id từ booking
    SELECT hotel_id INTO v_hotel_id FROM public.bookings WHERE id = p_booking_id;

    -- 1. Load settings từ bảng settings theo hotel_id (hoặc fallback)
    SELECT 
        grace_in_enabled,
        grace_out_enabled,
        grace_minutes,
        hourly_unit,
        base_hourly_limit,
        hourly_ceiling_enabled,
        hourly_ceiling_percent,
        overnight_start_time,
        overnight_end_time,
        check_out_time,
        full_day_late_after,
        night_audit_time,
        auto_overnight_switch,
        auto_full_day_early,
        auto_full_day_late
    INTO 
        v_grace_in_enabled, v_grace_out_enabled, v_grace_minutes,
        v_hourly_unit, v_base_block_count, v_ceiling_enabled,
        v_ceiling_percent, v_overnight_start, v_overnight_end,
        v_std_check_out, v_full_day_cutoff, v_full_day_early_cutoff,
        v_auto_overnight_switch, v_auto_full_day_early, v_auto_full_day_late
    FROM public.settings 
    WHERE (v_hotel_id IS NOT NULL AND hotel_id = v_hotel_id) OR (v_hotel_id IS NULL AND key = 'config')
    ORDER BY hotel_id NULLS LAST 
    LIMIT 1;

    IF v_full_day_early_cutoff IS NULL THEN
        v_full_day_early_cutoff := '04:00:00'::time;
    END IF;
    
    IF v_std_check_out IS NULL OR v_overnight_start IS NULL OR v_overnight_end IS NULL OR v_hourly_unit IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'LỖI CẤU HÌNH: Chưa thiết lập đầy đủ các thông số trong Cài đặt.'
        );
    END IF;

    -- 2. Load prices from room_categories
    SELECT 
        COALESCE(price_hourly, 0), 
        COALESCE(price_next_hour, 0), 
        COALESCE(price_daily, 0), 
        COALESCE(price_overnight, 0),
        COALESCE(overnight_enabled, false), 
        COALESCE(hourly_unit, 60), 
        COALESCE(base_hourly_limit, 1)
    INTO 
        v_price_hourly, v_price_next, v_price_daily, v_price_overnight,
        v_overnight_enabled, v_hourly_unit, v_base_block_count
    FROM public.room_categories
    WHERE id = p_room_cat_id;

    -- 3. Load Custom Price from Booking
    SELECT COALESCE(custom_price, 0) INTO v_custom_price FROM public.bookings WHERE id = p_booking_id;
    v_custom_price := COALESCE(v_custom_price, 0);
    
    IF v_custom_price > 0 THEN
        IF p_rental_type = 'hourly' THEN v_price_hourly := v_custom_price;
        ELSIF p_rental_type = 'overnight' THEN v_price_overnight := v_custom_price;
        ELSE v_price_daily := v_custom_price; END IF;
    END IF;

    v_duration_minutes := FLOOR(EXTRACT(EPOCH FROM (p_check_out - p_check_in)) / 60);
    v_check_in_time := (p_check_in AT TIME ZONE v_tz)::time;
    
    -- Auto-switch logic
    IF v_auto_overnight_switch AND p_rental_type IN ('hourly', 'daily') AND v_overnight_enabled THEN
        IF (v_check_in_time >= v_overnight_start OR v_check_in_time <= v_overnight_end) THEN
            v_rental_type_actual := 'overnight';
            v_explanations := array_append(v_explanations, format('Tự động áp dụng giá Qua đêm (Khách nhận phòng lúc %s)', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM')));
        END IF;
    END IF;

    -- Ceiling logic
    IF v_rental_type_actual = 'hourly' AND v_ceiling_enabled THEN
        DECLARE
            v_tmp_charge numeric := v_price_hourly;
            v_tmp_remaining numeric;
            v_tmp_blocks int;
        BEGIN
            v_first_block_min := v_base_block_count * v_hourly_unit;
            IF v_duration_minutes > v_first_block_min THEN
                v_tmp_remaining := v_duration_minutes - v_first_block_min;
                IF v_grace_out_enabled AND v_tmp_remaining <= v_grace_minutes THEN v_tmp_remaining := 0; END IF;
                IF v_tmp_remaining > 0 THEN
                    v_tmp_blocks := CEIL(v_tmp_remaining / v_hourly_unit);
                    v_tmp_charge := v_tmp_charge + (v_tmp_blocks * v_price_next);
                END IF;
            END IF;
            v_ceiling_amount := v_price_daily * (v_ceiling_percent / 100);
            IF v_tmp_charge > v_ceiling_amount THEN
                v_rental_type_actual := 'daily';
                v_explanations := array_append(v_explanations, format('Tiền giờ (%sđ) vượt trần giá ngày (%sđ) -> Chuyển sang tính giá Ngày', public.fn_format_money_vi(v_tmp_charge), public.fn_format_money_vi(v_ceiling_amount)));
            END IF;
        END;
    END IF;

    IF v_rental_type_actual = 'hourly' THEN
        v_first_block_min := v_base_block_count * v_hourly_unit;
        v_total_charge := v_price_hourly;
        v_units := 1;
        v_duration_text := v_base_block_count || ' giờ';
        
        IF v_duration_minutes > v_first_block_min THEN
            v_remaining_min := v_duration_minutes - v_first_block_min;
            DECLARE
                v_remainder_min numeric;
            BEGIN
                v_next_blocks := FLOOR(v_remaining_min / v_hourly_unit);
                v_remainder_min := MOD(v_remaining_min, v_hourly_unit);
                IF v_remainder_min > 0 THEN
                    IF (NOT v_grace_out_enabled) OR (v_remainder_min > v_grace_minutes) THEN
                        v_next_blocks := v_next_blocks + 1;
                        v_explanations := array_append(v_explanations, format('Block lẻ %s phút (> %s phút ân hạn) -> Tính tròn 1 block', ROUND(v_remainder_min, 0), v_grace_minutes));
                    END IF;
                END IF;
            END;
            IF v_next_blocks > 0 THEN
                v_total_charge := v_total_charge + (v_next_blocks * v_price_next);
                v_units := v_units + v_next_blocks;
                v_duration_text := (v_base_block_count + v_next_blocks) || ' giờ';
            END IF;
        END IF;

    ELSIF v_rental_type_actual = 'overnight' THEN
        DECLARE
            v_nights int;
        BEGIN
            v_nights := ((p_check_out AT TIME ZONE v_tz)::date - (p_check_in AT TIME ZONE v_tz)::date);
            IF v_nights < 1 THEN v_nights := 1; END IF;
            IF v_overnight_enabled = true AND (v_check_in_time >= v_overnight_start OR v_check_in_time <= v_overnight_end) THEN
                 v_total_charge := v_nights * v_price_overnight;
                 v_units := v_nights;
                 v_duration_text := v_nights || ' đêm';
            ELSE
                 v_total_charge := v_nights * v_price_daily;
                 v_units := v_nights;
                 v_duration_text := v_nights || ' ngày';
            END IF;
        END;

    ELSE -- Daily
        DECLARE
            v_days int;
            v_check_out_time time;
            v_check_in_time_only time;
            v_late_min numeric;
            v_early_min numeric;
            v_std_check_in time;
        BEGIN
           SELECT COALESCE(check_in_time, '14:00:00'::time) INTO v_std_check_in 
           FROM public.settings 
           WHERE (v_hotel_id IS NOT NULL AND hotel_id = v_hotel_id) OR (v_hotel_id IS NULL AND key = 'config')
           ORDER BY hotel_id NULLS LAST LIMIT 1;

           v_days := ((p_check_out AT TIME ZONE v_tz)::date - (p_check_in AT TIME ZONE v_tz)::date);
           IF v_days < 0 THEN v_days := 0; END IF;

           v_check_out_time := (p_check_out AT TIME ZONE v_tz)::time;
           v_late_min := FLOOR(EXTRACT(EPOCH FROM (v_check_out_time - v_std_check_out)) / 60);
           
           IF v_auto_full_day_late AND (v_check_out_time > v_full_day_cutoff) THEN
               IF NOT (v_grace_out_enabled AND v_late_min <= v_grace_minutes) THEN
                   v_days := v_days + 1;
                   v_explanations := array_append(v_explanations, format('Trả phòng muộn (%s) -> Tính thêm 1 ngày', to_char(p_check_out AT TIME ZONE v_tz, 'HH24:MI')));
               END IF;
           END IF;

           v_check_in_time_only := (p_check_in AT TIME ZONE v_tz)::time;
           v_early_min := FLOOR(EXTRACT(EPOCH FROM (v_std_check_in - v_check_in_time_only)) / 60);

           IF v_auto_full_day_early AND (v_check_in_time_only < v_full_day_early_cutoff) THEN
               IF NOT (v_grace_in_enabled AND v_early_min <= v_grace_minutes) THEN
                   v_days := v_days + 1;
                   v_explanations := array_append(v_explanations, format('Nhận phòng sớm (%s) -> Tính thêm 1 ngày', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI')));
               END IF;
           END IF;
           
           IF v_days < 1 THEN v_days := 1; END IF;
           v_total_charge := v_days * v_price_daily;
           v_units := v_days;
           v_duration_text := v_days || ' ngày';
        END;
    END IF;

    RETURN jsonb_build_object(
        'amount', v_total_charge,
        'explanation', v_explanations,
        'duration_minutes', v_duration_minutes,
        'rental_type_actual', v_rental_type_actual,
        'units', v_units,
        'duration_text', v_duration_text
    );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 6. UPDATE fn_calculate_surcharge (Settings per Hotel ID)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_calculate_surcharge(timestamp with time zone, timestamp with time zone, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_calculate_surcharge(
    p_check_in timestamp with time zone,
    p_check_out timestamp with time zone,
    p_room_cat_id uuid,
    p_rental_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_hotel_id uuid;
    v_std_check_in time;
    v_std_check_out time;
    v_overnight_checkout_time time;
    v_full_day_cutoff time;
    v_full_day_early_cutoff time;
    v_grace_minutes int;
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_surcharge_rules jsonb;
    v_auto_surcharge_enabled boolean;
    
    v_price_daily numeric;
    v_hourly_surcharge_rate numeric;
    v_surcharge_mode text;
    
    v_early_min numeric := 0;
    v_late_min numeric := 0;
    v_early_amount numeric := 0;
    v_late_amount numeric := 0;
    v_explanations text[] := '{}';
    
    v_rule jsonb;
    v_rule_from_min int;
    v_rule_to_min int;
    v_rule_percent numeric;
    v_rule_type text;
    
    v_check_out_time time;
    v_check_in_time time;
    v_rule_matched boolean := false;
    v_tz text := 'Asia/Ho_Chi_Minh';
BEGIN
    IF p_rental_type = 'hourly' THEN
        RETURN jsonb_build_object('amount', 0, 'early_amount', 0, 'late_amount', 0, 'explanation', ARRAY['Thuê giờ: Không áp dụng phụ thu Sớm/Muộn.']);
    END IF;

    -- Xác định hotel_id từ hạng phòng
    SELECT hotel_id INTO v_hotel_id FROM public.room_categories WHERE id = p_room_cat_id;

    SELECT 
        check_in_time,
        check_out_time,
        overnight_checkout_time,
        full_day_late_after,
        night_audit_time,
        grace_minutes,
        grace_in_enabled,
        grace_out_enabled,
        surcharge_rules,
        auto_surcharge_enabled
    INTO 
        v_std_check_in, v_std_check_out, v_overnight_checkout_time, 
        v_full_day_cutoff, v_full_day_early_cutoff, v_grace_minutes, 
        v_grace_in_enabled, v_grace_out_enabled, v_surcharge_rules, 
        v_auto_surcharge_enabled
    FROM public.settings 
    WHERE (v_hotel_id IS NOT NULL AND hotel_id = v_hotel_id) OR (v_hotel_id IS NULL AND key = 'config')
    ORDER BY hotel_id NULLS LAST 
    LIMIT 1;
    
    IF v_std_check_in IS NULL OR v_std_check_out IS NULL THEN
         RETURN jsonb_build_object('amount', 0, 'success', false, 'explanation', ARRAY['LỖI CẤU HÌNH: Thiếu mốc giờ Check-in/Check-out chuẩn.']);
    END IF;
    
    SELECT 
        price_daily, hourly_surcharge_amount, surcharge_mode,
        surcharge_rules, auto_surcharge_enabled
    INTO 
        v_price_daily, v_hourly_surcharge_rate, v_surcharge_mode,
        v_surcharge_rules, v_auto_surcharge_enabled
    FROM public.room_categories WHERE id = p_room_cat_id;

    IF NOT v_auto_surcharge_enabled THEN
        RETURN jsonb_build_object('amount', 0, 'early_amount', 0, 'late_amount', 0, 'explanation', ARRAY['Phụ thu tự động đang tắt.']);
    END IF;

    -- 1. LATE CHECK-OUT
    DECLARE
        v_target_checkout time;
    BEGIN
        IF p_rental_type = 'overnight' THEN
            v_target_checkout := v_overnight_checkout_time;
        ELSE 
            v_target_checkout := v_std_check_out;
        END IF;
        
        v_check_out_time := (p_check_out AT TIME ZONE v_tz)::time;

        IF (v_check_out_time > v_target_checkout) THEN
            IF p_rental_type = 'daily' AND ((p_check_out AT TIME ZONE v_tz)::date = (p_check_in AT TIME ZONE v_tz)::date) THEN
                 v_explanations := array_append(v_explanations, 'Trả phòng trong ngày: Không tính phụ thu trả muộn');
                 v_late_min := 0;
            ELSE
                v_late_min := EXTRACT(EPOCH FROM (v_check_out_time - v_target_checkout)) / 60;
                
                -- Ân hạn ra muộn cho ngày
                IF v_grace_out_enabled AND v_late_min <= v_grace_minutes THEN
                    v_explanations := array_append(v_explanations, format('Trả muộn %s phút (trong mức miễn phí %s phút): Không tính phụ phí', FLOOR(v_late_min), v_grace_minutes));
                    v_late_min := 0;
                ELSE
                    IF p_rental_type = 'daily' AND v_check_out_time > v_full_day_cutoff THEN
                        v_late_amount := 0;
                        v_explanations := array_append(v_explanations, format('Trả phòng lúc %s (sau %s): Đã cộng vào tiền phòng chính', to_char(p_check_out AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_full_day_cutoff, 'HH24:MI')));
                    ELSIF v_surcharge_mode = 'amount' THEN
                        v_late_amount := CEIL(v_late_min / 60) * v_hourly_surcharge_rate;
                        v_explanations := array_append(v_explanations, format('Trả muộn %s phút (vượt mức miễn phí %s phút): Phụ thu %s giờ x %sđ/giờ = %sđ', FLOOR(v_late_min), v_grace_minutes, CEIL(v_late_min/60), public.fn_format_money_vi(v_hourly_surcharge_rate), public.fn_format_money_vi(v_late_amount)));
                    ELSE
                        v_rule_matched := false;
                        IF v_surcharge_rules IS NOT NULL AND jsonb_typeof(v_surcharge_rules) = 'array' THEN
                             FOR v_rule IN SELECT * FROM jsonb_array_elements(v_surcharge_rules)
                             LOOP
                                v_rule_type := v_rule->>'type';
                                IF v_rule_type = 'Late' THEN
                                    v_rule_from_min := COALESCE((v_rule->>'from_minute')::int, 0);
                                    v_rule_to_min := COALESCE((v_rule->>'to_minute')::int, 0);
                                    v_rule_percent := (v_rule->>'percentage')::numeric;
                                    
                                    IF v_late_min > v_rule_from_min AND v_late_min <= v_rule_to_min THEN
                                        v_late_amount := v_price_daily * (v_rule_percent / 100);
                                        v_explanations := array_append(v_explanations, format('Trả muộn %s phút (Khung %s-%s phút): Phụ thu %s%% giá ngày = %sđ', FLOOR(v_late_min), v_rule_from_min, v_rule_to_min, v_rule_percent, public.fn_format_money_vi(v_late_amount)));
                                        v_rule_matched := true;
                                        EXIT;
                                    END IF;
                                END IF;
                             END LOOP;
                        END IF;
                        
                        IF NOT v_rule_matched THEN
                             v_late_amount := 0;
                             v_explanations := array_append(v_explanations, format('Trả muộn %s phút (Chưa có quy định phụ thu trễ)', FLOOR(v_late_min)));
                        END IF;
                    END IF;
                END IF;
            END IF;
        END IF;
    END;

    -- 2. EARLY CHECK-IN
    IF p_rental_type = 'daily' THEN
        BEGIN
            v_check_in_time := (p_check_in AT TIME ZONE v_tz)::time;
            IF (v_check_in_time < v_std_check_in) THEN
                v_early_min := EXTRACT(EPOCH FROM (v_std_check_in - v_check_in_time)) / 60;
                
                IF v_grace_in_enabled AND v_early_min <= v_grace_minutes THEN
                    v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (trong mức miễn phí %s phút): Không tính phụ phí', FLOOR(v_early_min), v_grace_minutes));
                    v_early_min := 0;
                ELSIF v_check_in_time < v_full_day_early_cutoff THEN
                    v_early_amount := 0;
                    v_explanations := array_append(v_explanations, format('Nhận sớm lúc %s (trước %s): Đã cộng vào tiền phòng chính', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_full_day_early_cutoff, 'HH24:MI')));
                ELSIF v_surcharge_mode = 'amount' THEN
                    v_early_amount := CEIL(v_early_min / 60) * v_hourly_surcharge_rate;
                    v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (vượt mức miễn phí %s phút): Phụ thu %s giờ x %sđ/giờ = %sđ', FLOOR(v_early_min), v_grace_minutes, CEIL(v_early_min/60), public.fn_format_money_vi(v_hourly_surcharge_rate), public.fn_format_money_vi(v_early_amount)));
                ELSE
                    v_rule_matched := false;
                    IF v_surcharge_rules IS NOT NULL AND jsonb_typeof(v_surcharge_rules) = 'array' THEN
                         FOR v_rule IN SELECT * FROM jsonb_array_elements(v_surcharge_rules)
                         LOOP
                            v_rule_type := v_rule->>'type';
                            IF v_rule_type = 'Early' THEN
                                v_rule_from_min := COALESCE((v_rule->>'from_minute')::int, 0);
                                v_rule_to_min := COALESCE((v_rule->>'to_minute')::int, 0);
                                v_rule_percent := (v_rule->>'percentage')::numeric;
                                
                                IF v_early_min > v_rule_from_min AND v_early_min <= v_rule_to_min THEN
                                    v_early_amount := v_price_daily * (v_rule_percent / 100);
                                    v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (Khung %s-%s phút): Phụ thu %s%% giá ngày = %sđ', FLOOR(v_early_min), v_rule_from_min, v_rule_to_min, v_rule_percent, public.fn_format_money_vi(v_early_amount)));
                                    v_rule_matched := true;
                                    EXIT;
                                END IF;
                            END IF;
                         END LOOP;
                    END IF;
                    
                    IF NOT v_rule_matched THEN
                        v_early_amount := 0;
                        v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (Chưa có quy định phụ thu sớm)', FLOOR(v_early_min)));
                    END IF;
                END IF;
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object(
        'amount', v_early_amount + v_late_amount,
        'early_amount', v_early_amount,
        'late_amount', v_late_amount,
        'explanation', v_explanations
    );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 7. UPDATE fn_perform_night_audit (Add Advisory Lock to prevent concurrent double run)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_perform_night_audit(uuid);

CREATE OR REPLACE FUNCTION public.fn_perform_night_audit(p_hotel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
    v_booking RECORD;
    v_current_bill jsonb;
    v_recorded_ledger_amount numeric;
    v_new_ledger_amount numeric;
    v_count int := 0;
    v_total_amount numeric := 0;
    v_night_audit_time time;
    v_today_audit_threshold timestamptz;
    v_last_audit_marker timestamptz;
BEGIN
    -- 1. Xác định hotel_id
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    IF v_hotel_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không xác định được Hotel ID');
    END IF;

    -- CHỐNG CHẠY TRÙNG LẶP ĐỒNG THỜI (Advisory Lock theo hotel_id)
    IF NOT pg_try_advisory_xact_lock(hashtext('night_audit_' || v_hotel_id::text)) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Night Audit đang được thực hiện bởi tiến trình khác');
    END IF;

    -- 2. Lấy cấu hình giờ chốt sổ
    SELECT COALESCE(night_audit_time, '04:00:00')::time INTO v_night_audit_time
    FROM public.settings 
    WHERE hotel_id = v_hotel_id OR hotel_id IS NULL 
    ORDER BY hotel_id NULLS LAST LIMIT 1;

    -- 3. Kiểm tra xem hôm nay đã chạy chưa (Tránh chạy trùng)
    v_today_audit_threshold := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_night_audit_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';
    
    IF now() < v_today_audit_threshold THEN
        v_today_audit_threshold := v_today_audit_threshold - INTERVAL '1 day';
    END IF;

    SELECT MAX(created_at) INTO v_last_audit_marker 
    FROM public.daily_expected_ledger 
    WHERE hotel_id = v_hotel_id AND event_type = 'NIGHT_AUDIT_MARKER';

    IF v_last_audit_marker >= v_today_audit_threshold THEN
        RETURN jsonb_build_object('success', true, 'message', 'Night Audit đã được thực hiện cho kỳ này.', 'last_run', v_last_audit_marker);
    END IF;

    -- 4. Quét toàn bộ phòng đang ở (Checked-in)
    FOR v_booking IN 
        SELECT b.id, b.room_id, b.rental_type, r.category_id, r.room_number
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        WHERE b.status = 'checked_in' AND b.hotel_id = v_hotel_id
    LOOP
        v_current_bill := public.calculate_booking_bill(v_booking.id);
        
        SELECT COALESCE(SUM(amount), 0) INTO v_recorded_ledger_amount
        FROM public.daily_expected_ledger
        WHERE booking_id = v_booking.id;

        v_new_ledger_amount := (v_current_bill->>'room_charge')::numeric + (v_current_bill->>'surcharge_amount')::numeric - v_recorded_ledger_amount;

        IF v_new_ledger_amount > 0 THEN
            INSERT INTO public.daily_expected_ledger (
                hotel_id, 
                booking_id, 
                amount, 
                description, 
                event_type
            )
            VALUES (
                v_hotel_id, 
                v_booking.id, 
                v_new_ledger_amount, 
                format('P.%s: Tăng tiền phòng/phụ thu ngày mới (Night Audit)', v_booking.room_number), 
                'MILESTONE'
            );
            
            v_count := v_count + 1;
            v_total_amount := v_total_amount + v_new_ledger_amount;
        END IF;
    END LOOP;

    -- 5. Đánh dấu đã hoàn tất Night Audit cho kỳ này
    INSERT INTO public.daily_expected_ledger (hotel_id, amount, description, event_type)
    VALUES (v_hotel_id, 0, 'Night Audit Marker', 'NIGHT_AUDIT_MARKER');

    RETURN jsonb_build_object(
        'success', true,
        'bookings_processed', v_count,
        'total_revenue_added', v_total_amount,
        'timestamp', now()
    );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 8. GRANT EXECUTE ON ALL FUNCTIONS TO ROLES
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.check_in_customer(uuid, text, uuid, numeric, text, jsonb, text, integer, integer, text, numeric, text, text, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid, text, uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, uuid, text, numeric, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reverse_cash_flow_on_cancel(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_calculate_room_charge(uuid, timestamptz, timestamptz, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_calculate_surcharge(timestamptz, timestamptz, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_perform_night_audit(uuid) TO anon, authenticated, service_role;

