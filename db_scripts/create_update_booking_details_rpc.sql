CREATE OR REPLACE FUNCTION public.update_booking_details(
    p_booking_id uuid,
    p_customer_name text DEFAULT NULL,
    p_check_in_at timestamptz DEFAULT NULL,
    p_custom_price numeric DEFAULT NULL,
    p_price_apply_mode text DEFAULT 'all',
    p_reason text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_customer_id uuid DEFAULT NULL -- New parameter for changing customer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_current_customer_id uuid;
    v_target_customer_id uuid;
    v_staff_id uuid;
    v_old_price numeric;
    v_old_check_in timestamptz;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    SELECT customer_id, custom_price, check_in_actual INTO v_current_customer_id, v_old_price, v_old_check_in
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_current_customer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Determine target customer ID
    v_target_customer_id := COALESCE(p_customer_id, v_current_customer_id);

    -- 1. Update Customer Link if changed
    IF p_customer_id IS NOT NULL AND p_customer_id <> v_current_customer_id THEN
        UPDATE public.bookings
        SET customer_id = p_customer_id
        WHERE id = p_booking_id;
    END IF;

    -- 2. Update Customer Name (on the target customer)
    IF p_customer_name IS NOT NULL THEN
        UPDATE public.customers
        SET full_name = p_customer_name, updated_at = now()
        WHERE id = v_target_customer_id;
    END IF;

    -- 3. Update Booking Details
    UPDATE public.bookings
    SET 
        check_in_actual = COALESCE(p_check_in_at, check_in_actual),
        custom_price = CASE WHEN p_custom_price IS NOT NULL THEN p_custom_price ELSE custom_price END,
        custom_price_reason = CASE WHEN p_custom_price IS NOT NULL THEN p_reason ELSE custom_price_reason END,
        notes = COALESCE(notes, '') || E'\n[' || now() || '] Cập nhật thông tin. ' || COALESCE(p_reason, '')
    WHERE id = p_booking_id;

    -- 4. Log Audit
    INSERT INTO public.audit_logs (booking_id, customer_id, staff_id, explanation)
    VALUES (
        p_booking_id, 
        v_target_customer_id, 
        v_staff_id, 
        jsonb_build_object(
            'action', 'update_booking_details',
            'changes', jsonb_build_object(
                'customer_name', p_customer_name,
                'check_in_at', p_check_in_at,
                'custom_price', p_custom_price,
                'price_apply_mode', p_price_apply_mode,
                'customer_id', p_customer_id
            ),
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object('success', true, 'message', 'Cập nhật thông tin thành công');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$function$;
