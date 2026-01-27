-- FIX: WALLET LOGIC FINAL (STRICT CASH/BANK ROUTING)
-- Date: 2026-01-27
-- Author: Trae (AI Assistant)
-- Purpose: Ensure Deposit via Transfer goes to BANK, Cash goes to CASH.

-- ==========================================================
-- PART 1: RESET TRIGGERS & FUNCTIONS
-- ==========================================================

DROP TRIGGER IF EXISTS tr_update_wallets ON public.cash_flow;
DROP FUNCTION IF EXISTS public.trg_update_wallets();

-- ==========================================================
-- PART 2: THE 5-FUND TRIGGER (LOGIC CORE)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.trg_update_wallets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_amount numeric;
    v_sign integer;
    v_payment_method text;
BEGIN
    v_amount := COALESCE(NEW.amount, 0);
    v_payment_method := lower(COALESCE(NEW.payment_method_code, 'cash')); -- Normalize & Default
    
    -- Determine Sign based on Flow Type
    IF NEW.flow_type = 'IN' THEN
        v_sign := 1;
    ELSE
        v_sign := -1;
    END IF;

    -- ==========================================================
    -- 1. LOGIC FOR "TIỀN CỌC" (DEPOSIT IN)
    -- ==========================================================
    IF NEW.category = 'Tiền cọc' THEN
        -- Physical Wallet Routing
        IF v_payment_method = 'cash' THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSE
            -- Bank, Transfer, QR, Card... -> All go to BANK
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;

        -- Logical Wallet: ESCROW (Always tracks deposits as Liability)
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';
        
        RETURN NEW;
    END IF;

    -- ==========================================================
    -- 2. LOGIC FOR "GHI NỢ" (CREDIT CHARGE)
    -- ==========================================================
    IF v_payment_method = 'credit' THEN
        -- Only affects RECEIVABLE (Increases Debt)
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN NEW;
    END IF;

    -- ==========================================================
    -- 3. LOGIC FOR "CHUYỂN CỌC" (DEPOSIT TRANSFER)
    -- ==========================================================
    IF v_payment_method = 'deposit_transfer' THEN
        -- Escrow decreases (Liability reduced)
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'ESCROW';
        -- Revenue increases (Realized income)
        UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'REVENUE';
        -- Receivable decreases (Debt paid by deposit)
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN NEW;
    END IF;

    -- ==========================================================
    -- 4. STANDARD PAYMENTS & EXPENSES
    -- ==========================================================
    
    -- A. Physical Wallet Routing
    IF v_payment_method = 'owner_equity' THEN
         -- Owner pays from pocket -> No change in CASH/BANK
         NULL; 
    ELSIF v_payment_method = 'cash' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
    ELSE
        -- Bank, Transfer...
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
    END IF;

    -- B. Logical Wallet Routing (Revenue/P&L)
    IF NEW.category NOT IN ('Trả nợ', 'Điều chỉnh', 'Nạp vốn') THEN
         UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
    END IF;
    
    -- C. Receivable Reduction (For IN flows that are payments)
    IF NEW.flow_type = 'IN' AND NEW.category NOT IN ('Nạp vốn', 'Tiền cọc') THEN
         UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
    END IF;

    RETURN NEW;
END;
$function$;

-- ==========================================================
-- PART 3: RE-APPLY TRIGGER
-- ==========================================================
CREATE TRIGGER tr_update_wallets
    AFTER INSERT OR UPDATE OR DELETE ON public.cash_flow
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_update_wallets();

-- ==========================================================
-- PART 4: UPDATE CHECK-IN RPC (To ensure it passes payment_method)
-- ==========================================================

-- Drop any ambiguous versions first
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text, uuid, text);

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
BEGIN
    -- Identify Staff
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

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
        room_id,
        customer_id,
        rental_type,
        check_in_actual,
        deposit_amount,
        payment_method, -- Lưu phương thức thanh toán cọc
        status,
        notes,
        services_used,
        extra_adults,
        extra_children,
        custom_price,
        custom_price_reason,
        source,
        verified_by_staff_id,
        verified_by_staff_name
    ) VALUES (
        p_room_id,
        v_customer_id,
        p_rental_type,
        v_check_in_at,
        p_deposit,
        p_payment_method,
        'checked_in',
        p_notes,
        p_services,
        p_extra_adults,
        p_extra_children,
        p_custom_price,
        p_custom_price_reason,
        p_source,
        v_staff_id,
        COALESCE(p_verified_by_staff_name, v_staff_name)
    ) RETURNING id INTO v_booking_id;

    -- 2. Update Room Status
    UPDATE public.rooms
    SET
        status = 'occupied',
        current_booking_id = v_booking_id,
        last_status_change = v_check_in_at
    WHERE id = p_room_id;

    -- 3. INITIAL ROOM CHARGE (Ghi nhận nợ tức thời)
    -- Calculate initial charge based on check-in time
    DECLARE
        v_room_cat_id uuid;
        v_initial_bill jsonb;
        v_initial_amount numeric;
    BEGIN
        SELECT category_id INTO v_room_cat_id FROM public.rooms WHERE id = p_room_id;
        
        v_initial_bill := public.fn_calculate_room_charge(
            v_booking_id,
            v_check_in_at, 
            v_check_in_at, -- Initial charge is calculated at check-in point
            p_rental_type,
            v_room_cat_id
        );
        v_initial_amount := (v_initial_bill->>'amount')::numeric;

        IF v_initial_amount > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, 
                category, 
                amount, 
                description, 
                payment_method_code, -- Use 'credit' to increase RECEIVABLE
                created_by, 
                verified_by_staff_id,
                verified_by_staff_name,
                ref_id, 
                is_auto, 
                occurred_at
            )
            VALUES (
                'IN', 
                'Tiền phòng', 
                v_initial_amount, 
                format('Ghi nhận nợ tiền phòng (%s) lúc nhận phòng: %s', p_rental_type, v_initial_bill->>'explanation'), 
                'credit',
                auth.uid(),
                v_staff_id,
                COALESCE(p_verified_by_staff_name, v_staff_name),
                v_booking_id, 
                true, 
                now()
            );
        END IF;
    END;

    -- 4. Record Cash Flow for Deposit (Modern audit)
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, 
            category, 
            amount, 
            description, 
            payment_method_code, -- Sử dụng phương thức thanh toán được truyền vào
            created_by, 
            verified_by_staff_id,
            verified_by_staff_name,
            ref_id, 
            is_auto, 
            occurred_at
        )
        VALUES (
            'IN', 
            'Tiền cọc', 
            p_deposit, 
            'Tiền cọc phòng ' || COALESCE(v_room_name, ''), 
            p_payment_method,
            auth.uid(),
            v_staff_id,
            COALESCE(p_verified_by_staff_name, v_staff_name),
            v_booking_id, 
            true, 
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id
    );
END;
$$;
