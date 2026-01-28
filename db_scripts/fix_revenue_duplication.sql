-- FIX: Revenue Duplication & Accrual Basis Logic
-- 1. Update process_checkout to record Revenue Adjustments (Credit) and Settlements (Cash) separately.
-- 2. Update fn_get_cash_flow_stats to filter Revenue (Credit) vs Cash Balance.

--------------------------------------------------------------------------------
-- 1. UPDATE PROCESS CHECKOUT
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid, 
    p_payment_method text, 
    p_amount_paid numeric, 
    p_discount numeric, 
    p_surcharge numeric, 
    p_notes text, 
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_room_id uuid;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_already_billed numeric;
    v_diff numeric;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());
    
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- 1. Update Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Revenue Adjustment (Accrual Basis)
    -- Calculate what was already recognized as revenue (Credit)
    SELECT COALESCE(SUM(amount), 0) INTO v_already_billed
    FROM public.cash_flow
    WHERE ref_id = p_booking_id 
      AND flow_type = 'IN' 
      AND payment_method_code = 'credit';

    v_diff := v_total_amount - v_already_billed;

    -- If there's a difference (Surcharges, Services, Discounts), record it as Accrued Revenue
    IF v_diff <> 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, ref_id, is_auto, occurred_at, payment_method_code
        ) VALUES (
            'IN', 
            CASE WHEN v_diff > 0 THEN 'Doanh thu bổ sung' ELSE 'Giảm trừ doanh thu' END,
            v_diff, 
            'Điều chỉnh doanh thu checkout (Phụ thu/Dịch vụ/Giảm giá)',
            v_staff_id, p_booking_id, true, now(), 'credit'
        );
    END IF;

    -- 5. Record Payment (Cash Flow - Settlement)
    BEGIN
        IF p_amount_paid > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, 
                category, 
                amount, 
                description, 
                created_by, 
                ref_id, 
                is_auto, 
                occurred_at,
                payment_method_code
            )
            VALUES (
                'IN', 
                'Thanh toán', -- Changed from 'Tiền phòng' to distinguish from Accrued Revenue
                p_amount_paid, 
                'Thanh toán checkout phòng ' || COALESCE(v_bill->>'room_name', '???') || ' - ' || COALESCE(v_bill->>'customer_name', 'Khách lẻ'), 
                v_staff_id, 
                p_booking_id, 
                true, 
                now(),
                lower(p_payment_method)
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN 
        INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
        VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, 0, to_jsonb(ARRAY['Lỗi ghi nhận dòng tiền: ' || SQLERRM]));
    END;

    -- 6. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 7. Record Audit Log
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- 8. Save Audit Trail
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$$;

--------------------------------------------------------------------------------
-- 2. UPDATE CASH FLOW STATS (ACCRUAL LOGIC)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_cash_flow_stats(
    p_from_date timestamptz,
    p_to_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_total_revenue numeric := 0;
    v_total_expense numeric := 0;
    v_cash_balance numeric := 0;
    v_chart_data jsonb;
BEGIN
    -- 1. TỔNG DOANH THU (REVENUE - Kế toán thành tích)
    -- Bao gồm: 
    -- - Các khoản Ghi nợ (credit) lúc Check-in (Tiền phòng) hoặc Checkout (Doanh thu bổ sung).
    -- - Các khoản Thu trực tiếp (không qua nợ) - thường là phiếu thu thủ công (is_auto = false).
    -- LOẠI TRỪ: Các khoản thanh toán nợ (settlement/Thanh toán) và Chuyển cọc (deposit_transfer).
    
    SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue
    FROM public.cash_flow
    WHERE flow_type = 'IN' 
      AND occurred_at BETWEEN p_from_date AND p_to_date
      AND (
          payment_method_code = 'credit' -- Ghi nhận doanh thu Accrual
          OR (
              payment_method_code NOT IN ('credit', 'deposit_transfer') 
              AND category NOT IN ('Thanh toán', 'Tiền cọc') -- Loại trừ thanh toán nợ và cọc
              AND is_auto = false -- Chỉ tính thu thủ công là doanh thu trực tiếp
          )
      );

    -- 2. TỔNG CHI PHÍ (EXPENSE)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expense
    FROM public.cash_flow
    WHERE flow_type = 'OUT' 
      AND occurred_at BETWEEN p_from_date AND p_to_date;

    -- 3. TỒN QUỸ THỰC TẾ (CASH + BANK)
    -- Chỉ tính số dư trong ví CASH và BANK
    SELECT COALESCE(SUM(balance), 0) INTO v_cash_balance
    FROM public.wallets
    WHERE id IN ('CASH', 'BANK');

    -- 4. DỮ LIỆU BIỂU ĐỒ (Doanh thu vs Chi phí theo ngày)
    SELECT jsonb_agg(t) INTO v_chart_data
    FROM (
        SELECT 
            date_trunc('day', occurred_at)::date as date,
            SUM(CASE 
                WHEN flow_type = 'IN' AND (
                    payment_method_code = 'credit' 
                    OR (payment_method_code NOT IN ('credit', 'deposit_transfer') AND category NOT IN ('Thanh toán', 'Tiền cọc') AND is_auto = false)
                ) 
                THEN amount ELSE 0 END) as total_in,
            SUM(CASE WHEN flow_type = 'OUT' THEN amount ELSE 0 END) as total_out
        FROM public.cash_flow
        WHERE occurred_at BETWEEN p_from_date AND p_to_date
        GROUP BY 1
        ORDER BY 1
    ) t;

    RETURN jsonb_build_object(
        'total_in', v_total_revenue,
        'total_out', v_total_expense, -- Trả về chi phí thực
        'net_income', v_total_revenue - v_total_expense,
        'current_balance', v_cash_balance,
        'chart_data', COALESCE(v_chart_data, '[]'::jsonb)
    );
END;
$$;
