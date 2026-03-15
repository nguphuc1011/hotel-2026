-- RPC TO ADJUST WALLET BALANCE SAFELY
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
    -- 1. Get Tenant ID
    v_hotel_id := public.fn_get_tenant_id();
    IF v_hotel_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy Hotel ID');
    END IF;

    -- 2. Get Staff Info
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    -- 3. Get Current Balance
    SELECT balance INTO v_current_balance 
    FROM public.wallets 
    WHERE id = p_wallet_id AND hotel_id = v_hotel_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy quỹ: ' || p_wallet_id);
    END IF;

    -- 4. Calculate Difference
    v_diff := p_actual_balance - v_current_balance;
    IF v_diff = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Số dư đã khớp, không cần điều chỉnh.');
    END IF;

    v_flow_type := CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END;

    -- 5. Create Cash Flow Entry
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

    -- 6. Trigger fn_sync_wallets will handle the wallet update automatically via the trigger

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
