-- RESTRICT DELETING/UPDATING AUTO TRANSACTIONS
-- Created: 2026-02-26

--------------------------------------------------------------------------------
-- 1. UPDATE RPC: fn_delete_cash_flow
--------------------------------------------------------------------------------
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
    
    -- 1.5 CHECK IS_AUTO (RESTORED RESTRICTION)
    IF COALESCE(v_record.is_auto, false) = true THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không thể xóa giao dịch tự động của hệ thống.');
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
-- 2. UPDATE RPC: fn_update_cash_flow
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

    -- 1.5 CHECK IS_AUTO (RESTORED RESTRICTION)
    IF COALESCE(v_record.is_auto, false) = true THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không thể sửa giao dịch tự động của hệ thống.');
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
