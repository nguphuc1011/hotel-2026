-- RESTORE REDUNDANT OVERLOADS TO ENSURE NO FEATURE LOSS
-- Based on previous database audit, these are the overloads that were dropped.

-- 1. Restore record_owner_expense(text, text, numeric)
-- This version doesn't require evidence_url
CREATE OR REPLACE FUNCTION public.record_owner_expense(
    p_creditor_name text, 
    p_description text, 
    p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_payable_id uuid;
BEGIN
    -- A. Record Debt in Sổ Nợ Ngoài
    INSERT INTO public.external_payables (creditor_name, amount, description, status)
    VALUES (p_creditor_name, p_amount, p_description, 'active')
    RETURNING id INTO v_payable_id;

    -- B. Record Expense in Cash Flow (affects REVENUE, skips CASH/BANK)
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, 
        payment_method_code, wallet_id, created_by, occurred_at
    ) VALUES (
        'OUT', 'Chi vận hành', p_amount, p_description || ' (Chủ chi)',
        'owner_equity', 'REVENUE', 
        NULL, -- System/Admin
        now()
    );

    RETURN jsonb_build_object('success', true, 'payable_id', v_payable_id);
END;
$function$;

-- 2. Restore import_inventory(uuid, numeric, numeric, text, uuid)
-- Simple version often used in older scripts or migration patches
CREATE OR REPLACE FUNCTION public.import_inventory(
    p_service_id uuid,
    p_qty_buy numeric,
    p_total_amount numeric,
    p_notes text DEFAULT NULL::text,
    p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_old_stock numeric;
    v_new_stock numeric;
    v_unit_cost numeric;
BEGIN
    SELECT stock_quantity INTO v_old_stock FROM services WHERE id = p_service_id;
    v_old_stock := COALESCE(v_old_stock, 0);
    v_new_stock := v_old_stock + (p_qty_buy * 1);
    
    v_unit_cost := CASE WHEN p_qty_buy > 0 THEN p_total_amount / p_qty_buy ELSE 0 END;
    
    UPDATE services 
    SET stock_quantity = v_new_stock, cost_price = v_unit_cost, updated_at = now()
    WHERE id = p_service_id;

    INSERT INTO inventory_logs (service_id, type, quantity, balance_before, balance_after, notes)
    VALUES (p_service_id, 'IMPORT', p_qty_buy, v_old_stock, v_new_stock, p_notes);

    INSERT INTO cash_flow (flow_type, category, amount, description, created_by)
    VALUES ('OUT', 'NHAP_HANG', p_total_amount, 'Nhập hàng: ' || p_notes, COALESCE(p_staff_id, auth.uid()));

    RETURN jsonb_build_object('success', true);
END;
$function$;

-- 3. Note on check_in_customer and process_checkout:
-- These were updated in fix_accrual_final.sql with SECURITY DEFINER and all parameters.
-- If the user feels they lost features, we should keep the LATEST version as the primary 
-- but we don't restore the "broken" ones because that would break the revenue logic.
-- However, to be safe, I've ensured the versions in fix_accrual_final.sql are COMPLETE.
