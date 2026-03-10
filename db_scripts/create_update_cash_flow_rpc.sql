-- FILE: c:\1hotel2\db_scripts\create_update_cash_flow_rpc.sql
-- AUTHOR: AI Assistant
-- DATE: 2026-02-26
-- DESCRIPTION: Create RPC to update cash flow transactions safely.

CREATE OR REPLACE FUNCTION public.fn_update_cash_flow(
    p_id uuid,
    p_amount numeric DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_occurred_at timestamp with time zone DEFAULT NULL,
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
    v_new_description text;
    v_new_occurred_at timestamptz;
    v_new_category text;
    v_new_pm_code text;
    v_wallet_changes jsonb := '[]'::jsonb;
BEGIN
    -- 1. Get existing record
    SELECT * INTO v_record FROM public.cash_flow WHERE id = p_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Giao dịch không tồn tại.');
    END IF;

    -- 2. Check if auto transaction
    IF v_record.is_auto THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không thể sửa giao dịch tự động từ hệ thống (Đặt phòng/Hóa đơn). Vui lòng điều chỉnh từ nguồn gốc.');
    END IF;

    -- 3. Prepare new values (use provided or keep existing)
    v_new_amount := COALESCE(p_amount, v_record.amount);
    v_new_description := COALESCE(p_description, v_record.description);
    v_new_occurred_at := COALESCE(p_occurred_at, v_record.occurred_at);
    v_new_category := COALESCE(p_category, v_record.category);
    v_new_pm_code := COALESCE(p_payment_method_code, v_record.payment_method_code);

    -- Append verified staff info to description if provided and changed
    IF p_verified_by_staff_name IS NOT NULL AND p_verified_by_staff_name <> COALESCE(v_record.verified_by_staff_name, '') THEN
        v_new_description := v_new_description || ' (Cập nhật bởi: ' || p_verified_by_staff_name || ')';
    END IF;

    -- 4. Perform Update
    -- The trigger `trg_update_wallets_dml` will automatically handle:
    -- - Reversing the old amount from old wallet
    -- - Applying the new amount to new wallet (if payment method changed)
    UPDATE public.cash_flow
    SET 
        amount = v_new_amount,
        description = v_new_description,
        occurred_at = v_new_occurred_at,
        category = v_new_category,
        payment_method_code = v_new_pm_code,
        verified_by_staff_id = COALESCE(p_verified_by_staff_id, v_record.verified_by_staff_id),
        verified_by_staff_name = COALESCE(p_verified_by_staff_name, v_record.verified_by_staff_name),
        updated_at = now()
    WHERE id = p_id;

    -- 5. Return success
    RETURN jsonb_build_object('success', true, 'message', 'Cập nhật giao dịch thành công.');
END;
$function$;
