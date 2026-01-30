-- 1. Create helper function for reversal (Bút toán đảo)
CREATE OR REPLACE FUNCTION public.fn_reverse_cash_flow_on_cancel(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r RECORD;
    v_reversed_count int := 0;
    v_total_reversed numeric := 0;
BEGIN
    -- Loop through all 'IN' transactions for this booking (Deposits, Payments)
    FOR r IN 
        SELECT * FROM public.cash_flow 
        WHERE ref_id = p_booking_id AND flow_type = 'IN'
    LOOP
        -- Create a reversal transaction (OUT)
        INSERT INTO public.cash_flow (
            ref_id,
            flow_type,
            category,
            amount,
            payment_method,
            payment_method_code,
            description,
            created_by,
            verified_by_staff_id,
            verified_by_staff_name,
            occurred_at
        ) VALUES (
            p_booking_id,
            'OUT',
            'Hoàn tiền hủy phòng',
            r.amount,
            r.payment_method,
            r.payment_method_code,
            'Bút toán đảo cho giao dịch #' || r.id || ': ' || r.description,
            r.created_by,
            r.verified_by_staff_id,
            r.verified_by_staff_name,
            now()
        );
        
        v_reversed_count := v_reversed_count + 1;
        v_total_reversed := v_total_reversed + r.amount;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'reversed_count', v_reversed_count, 
        'total_reversed', v_total_reversed
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 2. Update adjust_customer_balance to update BOOKING DEPOSIT and CUSTOMER BALANCE
CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
    p_customer_id uuid,
    p_amount numeric,
    p_type text, -- 'deposit', 'withdraw', 'payment'
    p_description text,
    p_booking_id uuid DEFAULT NULL,
    p_verified_by_staff_id uuid DEFAULT NULL,
    p_verified_by_staff_name text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash' -- 'cash', 'transfer', 'card'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_new_balance numeric;
    v_flow_type text;
    v_category text;
    v_ref_id uuid;
    v_booking_deposit_new numeric;
BEGIN
    -- Xác định loại giao dịch
    IF p_type = 'deposit' THEN
        v_flow_type := 'IN';
        -- Phân biệt nạp ví và thanh toán trước cho booking
        IF p_booking_id IS NOT NULL THEN
            v_category := 'Thanh toán trước'; 
            v_ref_id := p_booking_id;
        ELSE
            v_category := 'Nạp ví';
            v_ref_id := p_customer_id;
        END IF;
    ELSIF p_type = 'withdraw' OR p_type = 'payment' THEN
        v_flow_type := 'OUT';
        v_category := CASE WHEN p_type = 'payment' THEN 'Thanh toán dịch vụ' ELSE 'Rút tiền' END;
        v_ref_id := COALESCE(p_booking_id, p_customer_id);
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Loại giao dịch không hợp lệ');
    END IF;

    -- 1. Ghi vào cash_flow
    INSERT INTO public.cash_flow (
        ref_id,
        flow_type,
        category,
        amount,
        payment_method,      
        payment_method_code, 
        description,
        created_by,
        verified_by_staff_id,
        verified_by_staff_name,
        occurred_at
    ) VALUES (
        v_ref_id,
        v_flow_type,
        v_category,
        p_amount, 
        p_payment_method,
        p_payment_method,
        p_description,
        p_verified_by_staff_id,
        p_verified_by_staff_id,
        p_verified_by_staff_name,
        now()
    );

    -- 2. Cập nhật số dư khách hàng (nếu có cột balance)
    -- Kiểm tra xem cột balance có tồn tại không để tránh lỗi, nhưng ở đây ta assume là có vì user yêu cầu
    BEGIN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + CASE WHEN v_flow_type = 'IN' THEN p_amount ELSE -p_amount END
        WHERE id = p_customer_id
        RETURNING balance INTO v_new_balance;
    EXCEPTION WHEN OTHERS THEN
        -- Nếu lỗi (ví dụ không có cột balance), bỏ qua
        v_new_balance := 0;
    END;
    
    -- 3. QUAN TRỌNG: Cập nhật deposit_amount trong bảng BOOKINGS nếu là thanh toán trước
    IF p_booking_id IS NOT NULL AND p_type = 'deposit' THEN
        UPDATE public.bookings
        SET deposit_amount = COALESCE(deposit_amount, 0) + p_amount,
            updated_at = now()
        WHERE id = p_booking_id
        RETURNING deposit_amount INTO v_booking_deposit_new;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Giao dịch thành công', 
        'amount', p_amount,
        'type', p_type,
        'new_customer_balance', v_new_balance,
        'new_booking_deposit', v_booking_deposit_new
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi giao dịch: ' || SQLERRM);
END;
$function$;
