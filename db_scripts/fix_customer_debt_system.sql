-- ==============================================================================
-- FIX CUSTOMER DEBT & RECEIVABLE SYSTEM
-- 1. Bổ sung ghi log customer_transactions trong process_checkout khi khách nợ
-- 2. Bù đắp bản ghi transaction bị thiếu cho đơn nợ P104 (khách Thanh)
-- 3. Nâng cấp fn_get_money_page_stats tính trực tiếp DEBT từ customers và RECEIVABLE từ phòng đang ở
-- 4. Đồng bộ bảng wallets khớp 100% với customers và occupied rooms
-- ==============================================================================

-- 1. Nâng cấp process_checkout ghi nhận đúng customer_transactions
CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid, 
    p_payment_method text, 
    p_amount_paid numeric, 
    p_discount numeric, 
    p_surcharge numeric, 
    p_notes text, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_name text DEFAULT NULL::text, 
    p_selected_child_ids uuid[] DEFAULT NULL::uuid[]
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_staff_id uuid;
    v_staff_name text;
    v_room_id uuid;
    v_room_number text;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_hotel_id uuid;
    v_cat_id uuid;
    v_remaining_unpaid numeric;
    v_bill jsonb;
    v_cust_bal_before numeric;
    v_cust_bal_after numeric;
    v_net_change numeric;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF p_verified_by_staff_name IS NULL THEN 
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id; 
    ELSE 
        v_staff_name := p_verified_by_staff_name; 
    END IF;

    SELECT room_id, customer_id, hotel_id INTO v_room_id, v_customer_id, v_hotel_id FROM public.bookings WHERE id = p_booking_id;
    IF v_room_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_room_id;

    -- Cập nhật Booking
    UPDATE public.bookings 
    SET discount_amount = COALESCE(p_discount, 0), 
        custom_surcharge = COALESCE(p_surcharge, 0), 
        check_out_actual = now(), 
        status = 'completed', 
        payment_method = p_payment_method, 
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''), 
        verified_by_staff_id = v_staff_id, 
        verified_by_staff_name = v_staff_name 
    WHERE id = p_booking_id;

    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_room_id;

    -- Lấy Bill sau khi đã cập nhật discount/surcharge
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 1. Ghi nhận Thanh toán tiền mặt/chuyển khoản
    IF p_amount_paid > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'SETTLEMENT' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Thanh toán', v_cat_id, p_amount_paid, 'Thanh toán Checkout phòng P' || COALESCE(v_room_number, '???'), auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), lower(p_payment_method), v_hotel_id);
    END IF;

    -- 2. Ghi nhận Chuyển cọc
    IF v_deposit > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'DEPOSIT_TRANSFER' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Chuyển cọc', v_cat_id, v_deposit, 'Cọc chuyển sang tiền phòng (P' || COALESCE(v_room_number, '???') || ')', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'deposit_transfer', v_hotel_id);
    END IF;

    -- 3. Xử lý nợ tồn đọng hoặc tiền thừa
    v_remaining_unpaid := v_total_amount - v_deposit - p_amount_paid;
    IF v_remaining_unpaid > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'DEBT_TRANSFER' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Kết chuyển nợ', v_cat_id, v_remaining_unpaid, 'Chuyển nợ phòng P' || COALESCE(v_room_number, '???') || ' sang nợ khách cũ', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'debt_transfer', v_hotel_id);
    ELSIF v_remaining_unpaid < 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'REFUND' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('OUT', 'Hoàn tiền', v_cat_id, ABS(v_remaining_unpaid), 'Thối tiền thừa cho khách (P' || COALESCE(v_room_number, '???') || ')', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), lower(p_payment_method), v_hotel_id);
    END IF;

    -- 4. Cập nhật số dư khách hàng & ghi nhận vào customer_transactions
    IF v_customer_id IS NOT NULL THEN
        SELECT COALESCE(balance, 0) INTO v_cust_bal_before FROM public.customers WHERE id = v_customer_id AND hotel_id = v_hotel_id;
        v_net_change := p_amount_paid - (v_total_amount - v_deposit);
        v_cust_bal_after := v_cust_bal_before + v_net_change;

        UPDATE public.customers 
        SET balance = v_cust_bal_after, updated_at = now() 
        WHERE id = v_customer_id AND hotel_id = v_hotel_id;

        IF v_net_change <> 0 THEN
            INSERT INTO public.customer_transactions (
                customer_id, 
                type, 
                amount, 
                balance_before, 
                balance_after, 
                description, 
                booking_id, 
                verified_by_staff_id, 
                verified_by_staff_name, 
                hotel_id
            ) VALUES (
                v_customer_id, 
                (CASE WHEN v_net_change < 0 THEN 'charge' ELSE 'payment' END),
                ABS(v_net_change),
                v_cust_bal_before,
                v_cust_bal_after,
                'Check-out phòng P' || COALESCE(v_room_number, '???') || (CASE WHEN v_net_change < 0 THEN ' (Khách nợ lại: ' || public.fn_format_money_vi(ABS(v_net_change)) || ')' ELSE ' (Dư tiền: ' || public.fn_format_money_vi(v_net_change) || ')' END),
                p_booking_id,
                v_staff_id,
                v_staff_name,
                v_hotel_id
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;

-- 2. Bù đắp bản ghi transaction bị thiếu cho đơn nợ phòng 104 của khách Thanh
INSERT INTO public.customer_transactions (
    customer_id, 
    type, 
    amount, 
    balance_before, 
    balance_after, 
    description, 
    booking_id, 
    hotel_id, 
    created_at
)
SELECT 
    'a6f52cae-525c-4ba5-9860-dddd02f52908',
    'charge',
    270000,
    0,
    -270000,
    'Check-out phòng P104 (Khách nợ lại: 270.000 ₫)',
    'c2e40719-1009-4097-b95b-151ff4288c4a',
    '33e31139-346d-4332-8b0f-5316019cba8c',
    '2026-03-30 16:33:49.503+00'
WHERE NOT EXISTS (
    SELECT 1 FROM public.customer_transactions WHERE booking_id = 'c2e40719-1009-4097-b95b-151ff4288c4a'
);

-- 3. Nâng cấp fn_get_money_page_stats để đảm bảo DEBT và RECEIVABLE luôn chính xác 100%
CREATE OR REPLACE FUNCTION public.fn_get_money_page_stats(p_hotel_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
    v_cash_bal numeric := 0;
    v_bank_bal numeric := 0;
    v_receivable_bal numeric := 0;
    v_debt_bal numeric := 0;
    v_revenue_bal numeric := 0;

    v_cash_after_start numeric := 0;
    v_cash_after_end numeric := 0;
    v_cash_in numeric := 0;
    v_cash_out numeric := 0;

    v_bank_after_start numeric := 0;
    v_bank_after_end numeric := 0;
    v_bank_in numeric := 0;
    v_bank_out numeric := 0;

    v_receivable_after_start numeric := 0;
    v_receivable_after_end numeric := 0;

    v_debt_after_start numeric := 0;
    v_debt_after_end numeric := 0;

    v_revenue_after_start numeric := 0;
    v_revenue_after_end numeric := 0;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    IF v_hotel_id IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    -- 1. Lấy số dư hiện tại của Tiền mặt và Ngân hàng từ bảng wallets
    SELECT COALESCE(balance, 0) INTO v_cash_bal FROM public.wallets WHERE id = 'CASH' AND hotel_id = v_hotel_id;
    IF v_cash_bal IS NULL THEN v_cash_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_bank_bal FROM public.wallets WHERE id = 'BANK' AND hotel_id = v_hotel_id;
    IF v_bank_bal IS NULL THEN v_bank_bal := 0; END IF;

    -- 2. Tính số dư Công nợ khách (DEBT) trực tiếp từ tổng nợ thực tế của các khách hàng (balance < 0)
    SELECT COALESCE(SUM(ABS(balance)), 0) INTO v_debt_bal 
    FROM public.customers 
    WHERE hotel_id = v_hotel_id AND balance < 0;
    IF v_debt_bal IS NULL THEN v_debt_bal := 0; END IF;

    -- 3. Tính số dư Công nợ tạm (RECEIVABLE) trực tiếp từ số tiền cần thanh toán của các phòng đang có khách ở
    SELECT COALESCE(SUM((public.calculate_booking_bill(b.id)->>'amount_to_pay')::numeric), 0) INTO v_receivable_bal
    FROM public.bookings b
    WHERE b.hotel_id = v_hotel_id AND b.status = 'checked_in';
    IF v_receivable_bal IS NULL THEN v_receivable_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_revenue_bal FROM public.wallets WHERE id = 'REVENUE' AND hotel_id = v_hotel_id;
    IF v_revenue_bal IS NULL THEN v_revenue_bal := 0; END IF;

    -- 4. Tính toán dòng tiền ra vào trong kỳ
    WITH txs AS (
        SELECT 
            amount,
            flow_type,
            occurred_at,
            CASE 
                WHEN wallet_id IS NOT NULL THEN wallet_id
                WHEN LOWER(COALESCE(payment_method_code, 'cash')) IN ('cash', 'tm') THEN 'CASH'
                ELSE 'BANK'
            END AS target_wallet,
            LOWER(COALESCE(payment_method_code, 'cash')) AS p_method
        FROM public.cash_flow
        WHERE hotel_id = v_hotel_id
          AND occurred_at > p_start_date
    )
    SELECT
        -- Tiền mặt (CASH)
        COALESCE(SUM(CASE WHEN target_wallet = 'CASH' AND p_method NOT IN ('credit', 'deposit_transfer') THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'CASH' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'CASH' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at <= p_end_date AND flow_type = 'IN' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'CASH' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at <= p_end_date AND flow_type = 'OUT' THEN amount ELSE 0 END), 0),

        -- Ngân hàng (BANK)
        COALESCE(SUM(CASE WHEN target_wallet = 'BANK' AND p_method NOT IN ('credit', 'deposit_transfer') THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'BANK' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'BANK' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at <= p_end_date AND flow_type = 'IN' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'BANK' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at <= p_end_date AND flow_type = 'OUT' THEN amount ELSE 0 END), 0),

        -- Phải thu (RECEIVABLE)
        0, 0,

        -- Nợ phải trả (DEBT)
        0, 0,

        -- Doanh thu tích lũy (REVENUE)
        0, 0
    INTO
        v_cash_after_start, v_cash_after_end, v_cash_in, v_cash_out,
        v_bank_after_start, v_bank_after_end, v_bank_in, v_bank_out,
        v_receivable_after_start, v_receivable_after_end,
        v_debt_after_start, v_debt_after_end,
        v_revenue_after_start, v_revenue_after_end
    FROM txs;

    -- Đảm bảo không bị null
    v_cash_after_start := COALESCE(v_cash_after_start, 0);
    v_cash_after_end := COALESCE(v_cash_after_end, 0);
    v_cash_in := COALESCE(v_cash_in, 0);
    v_cash_out := COALESCE(v_cash_out, 0);

    v_bank_after_start := COALESCE(v_bank_after_start, 0);
    v_bank_after_end := COALESCE(v_bank_after_end, 0);
    v_bank_in := COALESCE(v_bank_in, 0);
    v_bank_out := COALESCE(v_bank_out, 0);

    -- Trả về đúng cấu trúc BalanceStats của Frontend
    RETURN jsonb_build_object(
        'cash', jsonb_build_object(
            'opening', v_cash_bal - v_cash_after_start,
            'in', v_cash_in,
            'out', v_cash_out,
            'closing', v_cash_bal - v_cash_after_end
        ),
        'bank', jsonb_build_object(
            'opening', v_bank_bal - v_bank_after_start,
            'in', v_bank_in,
            'out', v_bank_out,
            'closing', v_bank_bal - v_bank_after_end
        ),
        'receivable', jsonb_build_object(
            'opening', v_receivable_bal,
            'in', 0,
            'out', 0,
            'closing', v_receivable_bal
        ),
        'debt', jsonb_build_object(
            'opening', v_debt_bal,
            'in', 0,
            'out', 0,
            'closing', v_debt_bal
        ),
        'revenue', jsonb_build_object(
            'opening', v_revenue_bal,
            'in', 0,
            'out', 0,
            'closing', v_revenue_bal
        )
    );
END;
$function$;

-- 4. Đồng bộ bảng wallets
UPDATE public.wallets 
SET balance = 270000, updated_at = now() 
WHERE id = 'DEBT' AND hotel_id = '33e31139-346d-4332-8b0f-5316019cba8c';

UPDATE public.wallets 
SET balance = 440000, updated_at = now() 
WHERE id = 'RECEIVABLE' AND hotel_id = '33e31139-346d-4332-8b0f-5316019cba8c';

UPDATE public.wallets 
SET balance = 0, updated_at = now() 
WHERE id = 'DEBT' AND hotel_id = 'f6020952-a268-4086-8f17-f65d27d5f042';

UPDATE public.wallets 
SET balance = 132880000, updated_at = now() 
WHERE id = 'RECEIVABLE' AND hotel_id = 'f6020952-a268-4086-8f17-f65d27d5f042';
