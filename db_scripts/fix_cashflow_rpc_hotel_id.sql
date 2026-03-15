-- 1. FIX fn_create_cash_flow to include hotel_id automatically
CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text, 
    p_category text, 
    p_amount numeric, 
    p_description text, 
    p_occurred_at timestamp with time zone DEFAULT now(), 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_name text DEFAULT NULL::text, 
    p_payment_method_code text DEFAULT 'cash'::text, 
    p_ref_id uuid DEFAULT NULL::uuid, 
    p_is_auto boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE 
    v_new_id uuid;
    v_hotel_id uuid;
BEGIN
    -- Lấy hotel_id từ header x-hotel-id (via fn_get_tenant_id)
    v_hotel_id := public.fn_get_tenant_id();

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
        ref_id,
        is_auto,
        payment_method_code
    )
    VALUES (
        v_hotel_id,
        p_flow_type, 
        p_category, 
        p_amount, 
        COALESCE(p_description, '') || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_occurred_at, 
        COALESCE(p_verified_by_staff_id, auth.uid()),
        p_verified_by_staff_id,
        p_verified_by_staff_name,
        p_ref_id,
        p_is_auto,
        COALESCE(p_payment_method_code, 'cash')
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'data', v_new_id);
END;
$function$;

-- 2. FIX fn_sync_wallets to handle hotel_id correctly
CREATE OR REPLACE FUNCTION public.fn_sync_wallets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ 
DECLARE 
    v_delta NUMERIC := 0; 
    v_flow_sign INTEGER; 
    v_method TEXT; 
    v_rec RECORD; 
    v_is_revenue BOOLEAN := TRUE; 
    v_is_system BOOLEAN := FALSE; 
    v_cat_type TEXT; 
BEGIN 
    IF (TG_OP = 'DELETE') THEN 
        v_rec := OLD; 
        v_delta := -COALESCE(OLD.amount, 0); 
    ELSIF (TG_OP = 'INSERT') THEN 
        v_rec := NEW; 
        v_delta := COALESCE(NEW.amount, 0); 
    ELSE 
        v_rec := NEW; 
        v_delta := COALESCE(NEW.amount, 0) - COALESCE(OLD.amount, 0); 
    END IF; 

    IF v_delta = 0 AND TG_OP = 'UPDATE' THEN RETURN NEW; END IF; 

    v_flow_sign := CASE WHEN v_rec.flow_type = 'IN' THEN 1 ELSE -1 END; 
    v_method := lower(COALESCE(v_rec.payment_method_code, 'cash')); 

    -- Lấy thông tin Category
    SELECT is_revenue, is_system, type INTO v_is_revenue, v_is_system, v_cat_type 
    FROM public.cash_flow_categories 
    WHERE name = v_rec.category AND (hotel_id = v_rec.hotel_id OR hotel_id IS NULL)
    LIMIT 1; 

    -- Fallback mặc định
    IF v_is_revenue IS NULL THEN v_is_revenue := TRUE; END IF; 
    
    -- XỬ LÝ ĐẶC BIỆT CHO TIỀN CỌC
    IF v_rec.category IN ('Tiền cọc', 'Hoàn cọc', 'Thu trước') THEN
        v_is_revenue := FALSE;
        v_cat_type := 'DEPOSIT';
    END IF;

    -- Update Ví Vật lý (CASH/BANK)
    IF v_method NOT IN ('credit', 'deposit_transfer') THEN 
        UPDATE public.wallets 
        SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
        WHERE id = (CASE WHEN v_method = 'cash' THEN 'CASH' ELSE 'BANK' END)
          AND hotel_id = v_rec.hotel_id;
    END IF; 

    -- Update Ví Logic
    IF v_method = 'credit' THEN 
        UPDATE public.wallets 
        SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
        WHERE id = 'RECEIVABLE' AND hotel_id = v_rec.hotel_id;
        
        IF v_is_revenue THEN 
            UPDATE public.wallets 
            SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
            WHERE id = 'REVENUE' AND hotel_id = v_rec.hotel_id;
        END IF; 
    
    ELSIF (v_is_system OR v_rec.category IN ('Tiền cọc', 'Hoàn cọc', 'Thu trước')) AND (v_cat_type = 'DEPOSIT' OR v_rec.category IN ('Tiền cọc', 'Hoàn cọc', 'Thu trước')) THEN 
        UPDATE public.wallets 
        SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
        WHERE id = 'ESCROW' AND hotel_id = v_rec.hotel_id;
        
    ELSIF v_method = 'deposit_transfer' THEN 
        UPDATE public.wallets 
        SET balance = balance - v_delta, updated_at = now() 
        WHERE id = 'ESCROW' AND hotel_id = v_rec.hotel_id;
        UPDATE public.wallets 
        SET balance = balance - v_delta, updated_at = now() 
        WHERE id = 'RECEIVABLE' AND hotel_id = v_rec.hotel_id;
        
    ELSIF v_is_system AND v_cat_type = 'DEBT_COLLECTION' AND v_rec.flow_type = 'IN' THEN 
        UPDATE public.wallets 
        SET balance = balance - v_delta, updated_at = now() 
        WHERE id = 'RECEIVABLE' AND hotel_id = v_rec.hotel_id;
    ELSE 
        IF v_is_revenue THEN 
            UPDATE public.wallets 
            SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
            WHERE id = 'REVENUE' AND hotel_id = v_rec.hotel_id;
        END IF; 
    END IF; 

    RETURN NULL; 
END; $function$;
