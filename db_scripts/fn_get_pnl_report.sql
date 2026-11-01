-- BACKEND P&L REPORT ENGINE
-- Computes KPIs, Revenue/Expense Breakdown, COGS, Top Services and 3-Month Averages
-- 100% inside PostgreSQL for maximum speed, security, and tenant isolation.

CREATE OR REPLACE FUNCTION public.fn_get_pnl_report(
    p_hotel_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_revenue numeric := 0;
    v_total_opex numeric := 0;
    v_total_cogs numeric := 0;
    v_net_profit numeric := 0;
    v_rev_breakdown jsonb := '[]'::jsonb;
    v_exp_breakdown jsonb := '[]'::jsonb;
    v_top_items jsonb := '[]'::jsonb;
    v_averages jsonb := '{}'::jsonb;
    v_raw_cashflow jsonb := '[]'::jsonb;
    v_raw_services jsonb := '[]'::jsonb;
    v_three_months_ago timestamptz;
BEGIN
    v_three_months_ago := p_start_date - interval '3 months';

    -- 1. Calculate Revenue Breakdown & Total Revenue
    WITH rev_cats AS (
        SELECT name FROM public.cash_flow_categories 
        WHERE hotel_id = p_hotel_id AND is_revenue = true
    ),
    rev_grouped AS (
        SELECT 
            cf.category,
            SUM(cf.amount) as amount
        FROM public.cash_flow cf
        JOIN rev_cats rc ON cf.category = rc.name
        WHERE cf.hotel_id = p_hotel_id
          AND cf.flow_type = 'IN'
          AND cf.occurred_at >= p_start_date
          AND cf.occurred_at <= p_end_date
          AND cf.is_reversal = false
        GROUP BY cf.category
    )
    SELECT 
        COALESCE(SUM(amount), 0),
        COALESCE(jsonb_agg(jsonb_build_object('category', category, 'amount', amount, 'type', 'IN')), '[]'::jsonb)
    INTO v_total_revenue, v_rev_breakdown
    FROM rev_grouped;

    -- 2. Calculate 3-Month Past Averages for OpEx
    WITH past_expenses AS (
        SELECT 
            category,
            SUM(amount) as total_past
        FROM public.cash_flow
        WHERE hotel_id = p_hotel_id
          AND flow_type = 'OUT'
          AND occurred_at >= v_three_months_ago
          AND occurred_at < p_start_date
          AND is_reversal = false
          AND LOWER(category) NOT IN ('nhập hàng', 'nhap_hang', 'tiền phòng', 'tien_phong')
        GROUP BY category
    )
    SELECT COALESCE(jsonb_object_agg(category, ROUND(total_past / 3)), '{}'::jsonb)
    INTO v_averages
    FROM past_expenses;

    -- 3. Calculate OpEx Breakdown & Total OpEx
    WITH exp_grouped AS (
        SELECT 
            category,
            SUM(amount) as amount
        FROM public.cash_flow
        WHERE hotel_id = p_hotel_id
          AND flow_type = 'OUT'
          AND occurred_at >= p_start_date
          AND occurred_at <= p_end_date
          AND is_reversal = false
          AND LOWER(category) NOT IN ('nhập hàng', 'nhap_hang', 'tiền phòng', 'tien_phong')
        GROUP BY category
    )
    SELECT 
        COALESCE(SUM(amount), 0),
        COALESCE(jsonb_agg(jsonb_build_object(
            'category', category, 
            'amount', amount, 
            'type', 'OUT',
            'average', COALESCE((v_averages->>category)::numeric, 0)
        )), '[]'::jsonb)
    INTO v_total_opex, v_exp_breakdown
    FROM exp_grouped;

    -- 4. Calculate COGS & Top Items from booking_services
    WITH item_calc AS (
        SELECT 
            s.name,
            SUM(bs.quantity * bs.price_at_time) as revenue,
            SUM(bs.quantity * COALESCE(NULLIF(bs.cost_price_at_time, 0), s.cost_price, 0)) as cost,
            SUM(bs.quantity) as quantity
        FROM public.booking_services bs
        JOIN public.services s ON bs.service_id = s.id
        WHERE bs.hotel_id = p_hotel_id
          AND bs.status = 'active'
          AND bs.created_at >= p_start_date
          AND bs.created_at <= p_end_date
        GROUP BY s.name
    )
    SELECT 
        COALESCE(SUM(cost), 0),
        COALESCE(jsonb_agg(jsonb_build_object(
            'name', name,
            'revenue', revenue,
            'cost', cost,
            'profit', revenue - cost,
            'quantity', quantity
        ) ORDER BY (revenue - cost) DESC), '[]'::jsonb)
    INTO v_total_cogs, v_top_items
    FROM item_calc;

    -- Limit top items to top 5
    IF jsonb_array_length(v_top_items) > 5 THEN
        SELECT jsonb_agg(elem) INTO v_top_items 
        FROM (SELECT elem FROM jsonb_array_elements(v_top_items) elem LIMIT 5) t;
    END IF;

    -- 5. Raw Cash Flow with Staff Creator Name
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cf.id,
        'category', cf.category,
        'amount', cf.amount,
        'flow_type', cf.flow_type,
        'description', cf.description,
        'occurred_at', cf.occurred_at,
        'created_by', cf.created_by,
        'ref_id', cf.ref_id,
        'payment_method_code', cf.payment_method_code,
        'creator', jsonb_build_object('full_name', COALESCE(st.full_name, 'Hệ thống')),
        'is_revenue', EXISTS (
            SELECT 1 FROM public.cash_flow_categories cfc 
            WHERE cfc.hotel_id = p_hotel_id AND cfc.name = cf.category AND cfc.is_revenue = true
        )
    ) ORDER BY cf.occurred_at DESC), '[]'::jsonb)
    INTO v_raw_cashflow
    FROM public.cash_flow cf
    LEFT JOIN public.staff st ON cf.created_by = st.id
    WHERE cf.hotel_id = p_hotel_id
      AND cf.occurred_at >= p_start_date
      AND cf.occurred_at <= p_end_date
      AND cf.is_reversal = false;

    -- 6. Raw Services
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', bs.id,
        'quantity', bs.quantity,
        'price_at_time', bs.price_at_time,
        'cost_price_at_time', bs.cost_price_at_time,
        'created_at', bs.created_at,
        'booking_id', bs.booking_id,
        'service', jsonb_build_object('name', s.name, 'cost_price', s.cost_price),
        'booking', jsonb_build_object('room', jsonb_build_object('room_number', r.room_number))
    )), '[]'::jsonb)
    INTO v_raw_services
    FROM public.booking_services bs
    JOIN public.services s ON bs.service_id = s.id
    LEFT JOIN public.bookings b ON bs.booking_id = b.id
    LEFT JOIN public.rooms r ON b.room_id = r.id
    WHERE bs.hotel_id = p_hotel_id
      AND bs.status = 'active'
      AND bs.created_at >= p_start_date
      AND bs.created_at <= p_end_date;

    v_net_profit := v_total_revenue - v_total_cogs - v_total_opex;

    RETURN jsonb_build_object(
        'kpis', jsonb_build_object(
            'revenue', v_total_revenue,
            'cogs', v_total_cogs,
            'opex', v_total_opex,
            'net_profit', v_net_profit
        ),
        'revenueBreakdown', v_rev_breakdown,
        'expenseBreakdown', v_exp_breakdown,
        'topItems', v_top_items,
        'raw', jsonb_build_object(
            'cashFlow', v_raw_cashflow,
            'services', v_raw_services
        ),
        'averages', v_averages
    );
END;
$$;
