CREATE OR REPLACE FUNCTION public.fn_get_money_page_stats(
    p_hotel_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
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

    -- 1. Lấy số dư hiện tại của các ví an toàn
    SELECT COALESCE(balance, 0) INTO v_cash_bal FROM public.wallets WHERE id = 'CASH' AND hotel_id = v_hotel_id;
    IF v_cash_bal IS NULL THEN v_cash_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_bank_bal FROM public.wallets WHERE id = 'BANK' AND hotel_id = v_hotel_id;
    IF v_bank_bal IS NULL THEN v_bank_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_receivable_bal FROM public.wallets WHERE id = 'RECEIVABLE' AND hotel_id = v_hotel_id;
    IF v_receivable_bal IS NULL THEN v_receivable_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_debt_bal FROM public.wallets WHERE id = 'DEBT' AND hotel_id = v_hotel_id;
    IF v_debt_bal IS NULL THEN v_debt_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_revenue_bal FROM public.wallets WHERE id = 'REVENUE' AND hotel_id = v_hotel_id;
    IF v_revenue_bal IS NULL THEN v_revenue_bal := 0; END IF;

    -- 2. Tính toán tổng hợp trong 1 lần quét qua bảng cash_flow
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
        COALESCE(SUM(CASE WHEN target_wallet = 'RECEIVABLE' THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'RECEIVABLE' AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),

        -- Nợ phải trả (DEBT)
        COALESCE(SUM(CASE WHEN target_wallet = 'DEBT' THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'DEBT' AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),

        -- Doanh thu tích lũy (REVENUE)
        COALESCE(SUM(CASE WHEN target_wallet = 'REVENUE' THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'REVENUE' AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0)
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

    v_receivable_after_start := COALESCE(v_receivable_after_start, 0);
    v_receivable_after_end := COALESCE(v_receivable_after_end, 0);

    v_debt_after_start := COALESCE(v_debt_after_start, 0);
    v_debt_after_end := COALESCE(v_debt_after_end, 0);

    v_revenue_after_start := COALESCE(v_revenue_after_start, 0);
    v_revenue_after_end := COALESCE(v_revenue_after_end, 0);

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
            'opening', v_receivable_bal - v_receivable_after_start,
            'in', GREATEST(0, (v_receivable_bal - v_receivable_after_end) - (v_receivable_bal - v_receivable_after_start)),
            'out', GREATEST(0, (v_receivable_bal - v_receivable_after_start) - (v_receivable_bal - v_receivable_after_end)),
            'closing', v_receivable_bal - v_receivable_after_end
        ),
        'debt', jsonb_build_object(
            'opening', v_debt_bal - v_debt_after_start,
            'in', GREATEST(0, (v_debt_bal - v_debt_after_end) - (v_debt_bal - v_debt_after_start)),
            'out', GREATEST(0, (v_debt_bal - v_debt_after_start) - (v_debt_bal - v_debt_after_end)),
            'closing', v_debt_bal - v_debt_after_end
        ),
        'revenue', jsonb_build_object(
            'opening', v_revenue_bal - v_revenue_after_start,
            'in', GREATEST(0, (v_revenue_bal - v_revenue_after_end) - (v_revenue_bal - v_revenue_after_start)),
            'out', GREATEST(0, (v_revenue_bal - v_revenue_after_start) - (v_revenue_bal - v_revenue_after_end)),
            'closing', v_revenue_bal - v_revenue_after_end
        )
    );
END;
$$;
