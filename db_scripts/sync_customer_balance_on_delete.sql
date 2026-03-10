
-- SOLUTION: AUTOMATIC CUSTOMER BALANCE SYNC ON CASH FLOW DELETE/UPDATE
-- Created: 2026-02-26
-- Description: 
-- 1. Add customer_id to cash_flow table to link transactions directly to customers.
-- 2. Update RPCs (check_in, checkout, adjust_balance) to populate customer_id.
-- 3. Update fn_delete_cash_flow & fn_update_cash_flow to automatically sync customer balance/booking deposit.

--------------------------------------------------------------------------------
-- 1. SCHEMA UPDATE
--------------------------------------------------------------------------------
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_flow' AND column_name = 'customer_id') THEN 
        ALTER TABLE public.cash_flow ADD COLUMN customer_id uuid REFERENCES public.customers(id);
    END IF; 
END $$;

--------------------------------------------------------------------------------
-- 2. UPDATE RPC: adjust_customer_balance (Populate customer_id)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
    p_customer_id uuid, 
    p_amount numeric, 
    p_type text, 
    p_description text, 
    p_booking_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text,
    p_payment_method text DEFAULT 'cash'
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
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());

    SELECT true, balance INTO v_cust_exists, v_old_balance
    FROM customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF v_cust_exists IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Customer not found');
    END IF;

    v_old_balance := COALESCE(v_old_balance, 0);

    -- LOGIC BRANCHING
    IF p_type = 'deposit' AND p_booking_id IS NOT NULL THEN
        -- Case 1: Booking Deposit (Thanh toán trước cho Booking)
        UPDATE bookings 
        SET deposit_amount = COALESCE(deposit_amount, 0) + ABS(p_amount),
            updated_at = now()
        WHERE id = p_booking_id;
        
        v_new_balance := v_old_balance; -- Balance unchanged
        
        -- Transaction Log
        INSERT INTO customer_transactions (
            customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
        ) VALUES (
            p_customer_id, p_type, ABS(p_amount), v_old_balance, v_new_balance, 
            p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
            p_booking_id,
            v_staff_id
        );
        
        -- Cash Flow (IN) - ADDED customer_id
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_name, payment_method_code, ref_id, customer_id
        ) VALUES (
            'IN', 'Tiền cọc', ABS(p_amount),
            p_description || ' [Booking Deposit]',
            now(), v_staff_id, p_verified_by_staff_name, LOWER(p_payment_method), p_booking_id, p_customer_id
        );

    ELSE
        -- Case 2: Direct Balance Adjustment
        IF p_type = 'payment' THEN
            -- Customer pays us -> Balance Increases (Less Debt / More Credit)
            v_new_balance := v_old_balance + ABS(p_amount);
            v_flow_type := 'IN';
            v_category := 'Thu nợ';
        ELSIF p_type = 'refund' THEN
            -- We pay customer -> Balance Decreases
            v_new_balance := v_old_balance - ABS(p_amount);
            v_flow_type := 'OUT';
            v_category := 'Hoàn tiền';
        ELSIF p_type = 'charge' THEN
            -- Charge customer (Credit) -> Balance Decreases
            v_new_balance := v_old_balance - ABS(p_amount);
            v_flow_type := NULL; -- No Cash Flow for pure charge
        ELSE 
            -- Adjustment
            v_new_balance := v_old_balance + p_amount;
             IF p_amount > 0 THEN v_flow_type := 'IN'; v_category := 'Thu khác';
             ELSE v_flow_type := 'OUT'; v_category := 'Chi khác'; END IF;
        END IF;

        -- Update Customer Balance
        UPDATE customers
        SET balance = v_new_balance,
            updated_at = now()
        WHERE id = p_customer_id;

        -- Log Transaction
        INSERT INTO customer_transactions (
            customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
        ) VALUES (
            p_customer_id, p_type, ABS(p_amount), v_old_balance, v_new_balance, 
            p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
            p_booking_id, v_staff_id
        );

        -- Cash Flow (Only if flow type is set) - ADDED customer_id
        IF v_flow_type IS NOT NULL THEN
            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_name, payment_method_code, ref_id, customer_id
            ) VALUES (
                v_flow_type, v_category, ABS(p_amount),
                p_description || ' [Balance Adjustment]',
                now(), v_staff_id, p_verified_by_staff_name, LOWER(p_payment_method), p_booking_id, p_customer_id
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'new_balance', v_new_balance, 
        'message', 'Transaction processed successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

--------------------------------------------------------------------------------
-- 3. UPDATE RPC: process_checkout (Populate customer_id)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid,
    p_payment_method text,
    p_amount_paid numeric,
    p_discount numeric,
    p_surcharge numeric,
    p_notes text,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
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
    v_room_name text;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    
    -- Get Staff Name
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Get Room Name for description
    SELECT room_number INTO v_room_name FROM public.rooms WHERE id = v_room_id;

    -- Update Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = v_staff_id
    WHERE id = p_booking_id;

    -- Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- INSERT CASH FLOW - ADDED customer_id
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, payment_method_code, occurred_at, customer_id
        ) VALUES (
            'IN', 'Tiền phòng', p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, '') || ' (Checkout)', 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, LOWER(p_payment_method), now(), v_customer_id
        );
    END IF;

    -- Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- Record Audit Log
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- Audit Trail
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;

--------------------------------------------------------------------------------
-- 4. UPDATE RPC: check_in_customer (Populate customer_id)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_in_customer(
    p_room_id uuid,
    p_rental_type text,
    p_customer_id uuid DEFAULT NULL,
    p_deposit numeric DEFAULT 0,
    p_services jsonb DEFAULT '[]'::jsonb,
    p_customer_name text DEFAULT NULL,
    p_extra_adults int DEFAULT 0,
    p_extra_children int DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_custom_price numeric DEFAULT NULL,
    p_custom_price_reason text DEFAULT NULL,
    p_source text DEFAULT 'direct',
    p_verified_by_staff_id uuid DEFAULT NULL,
    p_verified_by_staff_name text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking_id uuid;
    v_customer_id uuid;
    v_staff_id uuid;
    v_staff_name text;
    v_room_status text;
    v_room_name text;
    v_check_in_at timestamptz := now();
    v_wallet_changes jsonb := '[]'::jsonb;
    v_pm_code text;
    v_deposit_amount numeric := 0;
    v_initial_amount numeric := 0;
BEGIN
    -- Identify Staff
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    v_pm_code := lower(COALESCE(p_payment_method, 'cash'));

    -- Get Room Info
    SELECT status, room_number INTO v_room_status, v_room_name FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.');
    END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.');
    END IF;

    -- Handle Customer
    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name)
        VALUES (p_customer_name)
        RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    -- 1. Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, check_in_actual, deposit_amount, payment_method, 
        status, notes, services_used, extra_adults, extra_children, 
        custom_price, custom_price_reason, source, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, v_check_in_at, p_deposit, p_payment_method,
        'checked_in', p_notes, p_services, p_extra_adults, p_extra_children,
        p_custom_price, p_custom_price_reason, p_source, v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name)
    ) RETURNING id INTO v_booking_id;

    -- 2. Update Room Status
    UPDATE public.rooms
    SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = v_check_in_at
    WHERE id = p_room_id;

    -- 3. INITIAL ROOM CHARGE - ADDED customer_id
    DECLARE
        v_room_cat_id uuid;
        v_initial_bill jsonb;
    BEGIN
        SELECT category_id INTO v_room_cat_id FROM public.rooms WHERE id = p_room_id;
        
        v_initial_bill := public.fn_calculate_room_charge(
            v_booking_id, v_check_in_at, v_check_in_at, p_rental_type, v_room_cat_id
        );
        v_initial_amount := (v_initial_bill->>'amount')::numeric;

        IF v_initial_amount > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, payment_method_code, 
                created_by, verified_by_staff_id, verified_by_staff_name, 
                ref_id, is_auto, occurred_at, customer_id
            )
            VALUES (
                'IN', 'Tiền phòng', v_initial_amount, 
                format('Ghi nhận nợ tiền phòng (%s) lúc nhận phòng: %s', p_rental_type, v_initial_bill->>'explanation'), 
                'credit', auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name),
                v_booking_id, true, now(), v_customer_id
            );
        END IF;
    END;

    -- 4. Record Cash Flow for Deposit - ADDED customer_id
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, payment_method_code, 
            created_by, verified_by_staff_id, verified_by_staff_name, 
            ref_id, is_auto, occurred_at, customer_id
        )
        VALUES (
            'IN', 'Tiền cọc', p_deposit, 
            'Tiền cọc phòng ' || COALESCE(v_room_name, ''), 
            v_pm_code, auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name),
            v_booking_id, true, now(), v_customer_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id
    );
END;
$$;

--------------------------------------------------------------------------------
-- 5. UPDATE RPC: fn_delete_cash_flow (Sync Logic)
--------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_delete_cash_flow(uuid, text);

CREATE OR REPLACE FUNCTION public.fn_delete_cash_flow(
    p_id uuid,
    p_reason text DEFAULT NULL,
    p_verified_by_staff_id uuid DEFAULT NULL,
    p_verified_by_staff_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_record RECORD;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_wallet_name text;
    v_pm_code text;
    v_user_id uuid;
    v_void_id uuid;
    v_policy text;
    v_cust_id uuid;
    v_sync_msg text := '';
BEGIN
    v_user_id := auth.uid();

    -- 0. SECURITY CHECK
    SELECT public.fn_resolve_policy(v_user_id, 'finance_delete_transaction') INTO v_policy;
    IF v_policy = 'DENY' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bạn không có quyền Xóa giao dịch.');
    END IF;

    -- 1. Get record info
    SELECT * INTO v_record FROM public.cash_flow WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Giao dịch không tồn tại.');
    END IF;
    
    IF v_record.description LIKE 'VOID:%' THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không thể xóa giao dịch đã hủy.');
    END IF;

    -- 2. Perform VOID (Inverse Transaction)
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, occurred_at, created_by, 
        ref_id, payment_method_code, customer_id, verified_by_staff_id, verified_by_staff_name
    )
    VALUES (
        v_record.flow_type,
        v_record.category,
        -v_record.amount, -- Inverse Amount
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

    -- 3. SYNC LOGIC: Update Customer Balance / Booking Deposit
    v_cust_id := v_record.customer_id;
    
    -- Fallback: Try finding customer via Booking ref_id if customer_id is missing
    IF v_cust_id IS NULL AND v_record.ref_id IS NOT NULL THEN
        SELECT customer_id INTO v_cust_id FROM public.bookings WHERE id = v_record.ref_id;
    END IF;

    IF v_cust_id IS NOT NULL THEN
       DECLARE
            v_current_balance numeric;
            v_new_balance numeric;
       BEGIN
           -- Get current balance
           SELECT balance INTO v_current_balance FROM public.customers WHERE id = v_cust_id;
           v_current_balance := COALESCE(v_current_balance, 0);

           -- Case A: Deposit (Tiền cọc) -> Update Booking Deposit Amount (Only if linked to Booking)
           IF v_record.category = 'Tiền cọc' AND v_record.ref_id IS NOT NULL THEN
                UPDATE public.bookings 
                SET deposit_amount = GREATEST(0, deposit_amount - v_record.amount)
                WHERE id = v_record.ref_id;
                v_sync_msg := ' (Đã cập nhật lại tiền cọc Booking)';
                
                -- Also log to customer_transactions for deposit adjustment? 
                -- Usually deposit is linked to booking, but let's be thorough.
                -- However, deposit change doesn't affect customer.balance directly.
                -- So we skip customer_transactions update here unless we want to track deposit changes.
                -- Let's stick to balance changes.

           -- Case B: Payment (IN) -> Customer Balance Decreases (Debt Increases)
           ELSIF v_record.flow_type = 'IN' THEN
                v_new_balance := v_current_balance - v_record.amount;
                
                UPDATE public.customers 
                SET balance = v_new_balance 
                WHERE id = v_cust_id;
                
                -- Log to customer_transactions
                INSERT INTO public.customer_transactions (
                    customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
                ) VALUES (
                    v_cust_id, 'adjustment', -v_record.amount, v_current_balance, v_new_balance,
                    'Hủy phiếu thu: ' || v_record.description, v_record.ref_id, v_user_id
                );
                
                v_sync_msg := ' (Đã cập nhật lại công nợ khách)';

           -- Case C: Refund (OUT) -> Customer Balance Increases (Debt Decreases)
           ELSIF v_record.flow_type = 'OUT' THEN
                v_new_balance := v_current_balance + v_record.amount;
                
                UPDATE public.customers 
                SET balance = v_new_balance 
                WHERE id = v_cust_id;
                
                -- Log to customer_transactions
                INSERT INTO public.customer_transactions (
                    customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
                ) VALUES (
                    v_cust_id, 'adjustment', v_record.amount, v_current_balance, v_new_balance,
                    'Hủy phiếu chi: ' || v_record.description, v_record.ref_id, v_user_id
                );
                
                v_sync_msg := ' (Đã cập nhật lại công nợ khách)';
           END IF;
       END;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đã xóa giao dịch và hoàn tiền vào quỹ' || v_sync_msg);
END;
$function$;

--------------------------------------------------------------------------------
-- 6. UPDATE RPC: fn_update_cash_flow (Added Customer Balance Sync)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_update_cash_flow(
    p_id uuid,
    p_amount numeric DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_occurred_at timestamptz DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_payment_method_code text DEFAULT NULL,
    p_verified_by_staff_id uuid DEFAULT NULL,
    p_verified_by_staff_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_record RECORD;
    v_new_amount numeric;
    v_diff numeric;
    v_cust_id uuid;
    v_sync_msg text := '';
    v_policy text;
BEGIN
    -- 0. Security Check
    SELECT public.fn_resolve_policy(auth.uid(), 'finance_delete_transaction') INTO v_policy;
    IF v_policy = 'DENY' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bạn không có quyền Sửa giao dịch.');
    END IF;

    -- 1. Get record info
    SELECT * INTO v_record FROM public.cash_flow WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Giao dịch không tồn tại.');
    END IF;

    v_new_amount := COALESCE(p_amount, v_record.amount);
    v_diff := v_new_amount - v_record.amount;

    -- 2. Update Record
    UPDATE public.cash_flow
    SET 
        amount = v_new_amount,
        description = COALESCE(p_description, v_record.description),
        occurred_at = COALESCE(p_occurred_at, v_record.occurred_at),
        category = COALESCE(p_category, v_record.category),
        payment_method_code = COALESCE(p_payment_method_code, v_record.payment_method_code),
        verified_by_staff_id = COALESCE(p_verified_by_staff_id, v_record.verified_by_staff_id),
        verified_by_staff_name = COALESCE(p_verified_by_staff_name, v_record.verified_by_staff_name),
        updated_at = now()
    WHERE id = p_id;

    -- 3. SYNC LOGIC (Only if Amount Changed)
    IF v_diff <> 0 THEN
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

               -- Case A: Deposit
               IF v_record.category = 'Tiền cọc' AND v_record.ref_id IS NOT NULL THEN
                    UPDATE public.bookings 
                    SET deposit_amount = deposit_amount + v_diff
                    WHERE id = v_record.ref_id;
                    v_sync_msg := ' (Đã cập nhật tiền cọc)';
               
               -- Case B: Payment (IN)
               ELSIF v_record.flow_type = 'IN' THEN
                    -- If amount increased, balance increases (more credit/less debt)
                    v_new_balance := v_current_balance + v_diff;
                    UPDATE public.customers 
                    SET balance = v_new_balance
                    WHERE id = v_cust_id;
                    
                    INSERT INTO public.customer_transactions (
                        customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
                    ) VALUES (
                        v_cust_id, 'adjustment', v_diff, v_current_balance, v_new_balance,
                        'Sửa phiếu thu: ' || v_record.description, v_record.ref_id, auth.uid()
                    );
                    
                    v_sync_msg := ' (Đã cập nhật công nợ)';

               -- Case C: Refund (OUT)
               ELSIF v_record.flow_type = 'OUT' THEN
                    -- Refund (OUT) -> Balance -= Amount.
                    -- If Amount increases (v_diff > 0), Balance decreases MORE (Balance - v_diff).
                    v_new_balance := v_current_balance - v_diff;
                    UPDATE public.customers 
                    SET balance = v_new_balance
                    WHERE id = v_cust_id;
                    
                    INSERT INTO public.customer_transactions (
                        customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
                    ) VALUES (
                        v_cust_id, 'adjustment', -v_diff, v_current_balance, v_new_balance,
                        'Sửa phiếu chi: ' || v_record.description, v_record.ref_id, auth.uid()
                    );
                    
                    v_sync_msg := ' (Đã cập nhật công nợ)';
               END IF;
           END;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Cập nhật giao dịch thành công' || v_sync_msg);
END;
$function$;
