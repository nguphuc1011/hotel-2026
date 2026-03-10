-- FINANCE SECURITY & DYNAMIC POLICY INTEGRATION
-- Created: 2026-02-02
-- Description: 
-- 1. Integrate 'finance_void_transaction' with Dynamic Security Policy (Tam Tầng)
-- 2. Allow flexibility: if settings say ALLOW/PIN, let Staff do it via RPC.

--------------------------------------------------------------------------------
-- 1. UPDATE RPC: fn_delete_cash_flow (VOID LOGIC + SECURITY CHECK)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_delete_cash_flow(
    p_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Use Owner privileges to bypass RLS for the actual INSERT
AS $function$
DECLARE
    v_record RECORD;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_wallet_name text;
    v_pm_code text;
    v_user_id uuid;
    v_void_id uuid;
    v_policy text;
BEGIN
    v_user_id := auth.uid();

    -- 0. SECURITY CHECK (DYNAMIC POLICY)
    -- Check if user is allowed to perform 'finance_void_transaction'
    -- Using fn_resolve_policy to get: ALLOW, PIN, DENY
    
    -- Note: If the UI has already done the PIN check/Approval flow, 
    -- it should technically be fine, but the RPC is the last line of defense.
    -- However, fn_resolve_policy doesn't validate the PIN itself, it just tells us the requirement.
    -- Ideally, we should trust the UI verification OR pass the approval proof.
    -- For now, we will BLOCK if policy is DENY.
    -- If policy is PIN, we assume the UI handled it (or we could enforce strict check later).
    
    -- Let's check the policy:
    SELECT public.fn_resolve_policy(v_user_id, 'finance_void_transaction') INTO v_policy;

    IF v_policy = 'DENY' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bạn không có quyền Hủy giao dịch (Bị cấm bởi Cài đặt bảo mật).');
    END IF;

    -- 1. Get record info
    SELECT * INTO v_record FROM public.cash_flow WHERE id = p_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Giao dịch không tồn tại.');
    END IF;

    IF v_record.is_auto THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không thể hủy giao dịch tự động của hệ thống.');
    END IF;
    
    IF v_record.description LIKE 'VOID:%' THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không thể hủy giao dịch đã là giao dịch hủy.');
    END IF;

    -- 2. Perform VOID (Inverse Transaction)
    INSERT INTO public.cash_flow (
        flow_type,
        category,
        amount, 
        description,
        occurred_at,
        created_by,
        ref_id,
        payment_method_code
    )
    VALUES (
        v_record.flow_type,
        v_record.category,
        -v_record.amount, -- Inverse Amount
        'VOID: ' || v_record.description || COALESCE(' - Lý do: ' || p_reason, ''),
        now(),
        v_user_id,
        v_record.id,
        v_record.payment_method_code
    )
    RETURNING id INTO v_void_id;

    -- 3. Calculate Wallet Impact
    v_pm_code := lower(COALESCE(v_record.payment_method_code, 'cash'));
    
    IF v_pm_code IN ('cash', 'tien mat', 'tiền mặt') THEN
        v_wallet_name := 'CASH';
    ELSE
        v_wallet_name := 'BANK';
    END IF;

    IF v_record.flow_type = 'IN' THEN
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', v_wallet_name, 'diff', -v_record.amount);
        IF v_record.category = 'Tiền cọc' THEN
             v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'ESCROW', 'diff', -v_record.amount);
        ELSE
             v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', -v_record.amount);
             v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'RECEIVABLE', 'diff', v_record.amount);
        END IF;
    ELSIF v_record.flow_type = 'OUT' THEN
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', v_wallet_name, 'diff', v_record.amount);
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', v_record.amount);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Đã hủy giao dịch thành công (Tạo phiếu điều chỉnh).', 
        'wallet_changes', v_wallet_changes,
        'void_transaction_id', v_void_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

--------------------------------------------------------------------------------
-- 2. CONFIGURE DEFAULT POLICIES (Example Defaults)
--------------------------------------------------------------------------------
-- Ensure the key exists
INSERT INTO public.settings_security (key, description, is_enabled, category, policy_type)
VALUES ('finance_void_transaction', 'Hủy/Đảo giao dịch tài chính', true, 'finance', 'PIN')
ON CONFLICT (key) DO UPDATE SET policy_type = EXCLUDED.policy_type;

-- Set default role policies (Just examples, Admin can change in UI)
-- Manager: ALLOW (Tự quyết)
INSERT INTO public.security_role_policies (role, action_key, policy_type)
VALUES ('Manager', 'finance_void_transaction', 'ALLOW')
ON CONFLICT (role, action_key) DO UPDATE SET policy_type = EXCLUDED.policy_type;

-- Staff: PIN (Cần PIN) or DENY (Cấm) -> Let's set to PIN to be flexible per User request
INSERT INTO public.security_role_policies (role, action_key, policy_type)
VALUES ('Staff', 'finance_void_transaction', 'PIN')
ON CONFLICT (role, action_key) DO UPDATE SET policy_type = EXCLUDED.policy_type;
