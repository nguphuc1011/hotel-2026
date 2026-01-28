-- Function to calculate average transaction amount per category over a lookback period
CREATE OR REPLACE FUNCTION get_category_averages(lookback_months int)
RETURNS TABLE (category text, avg_amount numeric)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cf.category,
        ROUND(AVG(cf.amount), 0)::numeric as avg_amount
    FROM 
        cash_flow cf
    WHERE 
        cf.occurred_at >= (CURRENT_DATE - (lookback_months || ' months')::interval)
        AND cf.occurred_at < CURRENT_DATE -- Exclude today/future to avoid skewing with partial data? Or just strictly past.
        AND cf.is_reversal = false
    GROUP BY 
        cf.category;
END;
$$;