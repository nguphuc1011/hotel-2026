CREATE OR REPLACE FUNCTION public.fn_delete_cash_flow(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_record RECORD;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_wallet_name text;
    v_pm_code text;
BEGIN
    -- 1. Get record info
    SELECT * INTO v_record FROM public.cash_flow WHERE id = p_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Giao dịch không tồn tại.');
    END IF;

    IF v_record.is_auto THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không thể xóa giao dịch tự động.');
    END IF;

    v_pm_code := lower(COALESCE(v_record.payment_method_code, 'cash'));

    -- 2. Delete record (Trigger will handle actual wallet update)
    DELETE FROM public.cash_flow WHERE id = p_id;

    -- 3. Calculate Impact (Reverse)
    -- Determine Wallet Name
    IF v_pm_code IN ('cash', 'tien mat', 'tiền mặt') THEN
        v_wallet_name := 'CASH';
    ELSE
        v_wallet_name := 'BANK';
    END IF;

    IF v_record.flow_type = 'IN' THEN
        -- Reverse IN: Wallet - Amount
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', v_wallet_name, 'diff', -v_record.amount);
        
        IF v_record.category = 'Tiền cọc' THEN
             -- Reverse Deposit: Escrow - Amount
             v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'ESCROW', 'diff', -v_record.amount);
        ELSE
             -- Reverse Standard IN: Revenue - Amount, Receivable + Amount
             v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', -v_record.amount);
             v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'RECEIVABLE', 'diff', v_record.amount);
        END IF;

    ELSIF v_record.flow_type = 'OUT' THEN
        -- Reverse OUT: Wallet + Amount, Revenue + Amount (Expense Reversal)
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', v_wallet_name, 'diff', v_record.amount);
        
        -- Reverse Expense: Revenue + Amount
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', v_record.amount);
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đã xóa giao dịch thành công.', 'wallet_changes', v_wallet_changes);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;
