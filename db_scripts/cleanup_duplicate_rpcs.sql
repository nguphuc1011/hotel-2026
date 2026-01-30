-- 1. CLEANUP DUPLICATE RPCs
-- Drop all overloads of update_booking_details to ensure clean state
DROP FUNCTION IF EXISTS public.update_booking_details(uuid, text, timestamp with time zone, numeric, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.update_booking_details(uuid, text, timestamp with time zone, numeric, text, text, uuid);

-- Re-create the SINGLE STANDARD version of update_booking_details
CREATE OR REPLACE FUNCTION public.update_booking_details(
    p_booking_id uuid,
    p_customer_name text DEFAULT NULL,
    p_check_in_at timestamptz DEFAULT NULL,
    p_custom_price numeric DEFAULT NULL,
    p_price_apply_mode text DEFAULT 'all',
    p_reason text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_customer_id uuid DEFAULT NULL -- Standardized with customer_id
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

-- Drop all overloads of cancel_booking
DROP FUNCTION IF EXISTS public.cancel_booking(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.cancel_booking(uuid, text);

-- Re-create SINGLE STANDARD version of cancel_booking
CREATE OR REPLACE FUNCTION public.cancel_booking(
    p_booking_id uuid,
    p_reason text,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_staff_id uuid;
    v_status text;
    v_room_id uuid;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    SELECT status, room_id INTO v_status, v_room_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_status IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    IF v_status = 'cancelled' OR v_status = 'completed' THEN
         RETURN jsonb_build_object('success', false, 'message', 'Booking đã kết thúc hoặc đã hủy');
    END IF;

    -- Update Booking Status
    UPDATE public.bookings
    SET status = 'cancelled',
        notes = COALESCE(notes, '') || E'\n[' || now() || '] Đã hủy phòng. Lý do: ' || p_reason,
        updated_at = now()
    WHERE id = p_booking_id;

    -- Update Room Status to CLEANING (or AVAILABLE depending on policy, usually CLEANING to be safe)
    -- But if user just checked in and cancelled immediately, maybe available.
    -- Standard: Set to CLEANING (dirty) to ensure housekeeping checks it.
    UPDATE public.rooms
    SET status = 'cleaning' 
    WHERE id = v_room_id;

    -- Log Audit
    INSERT INTO public.audit_logs (booking_id, staff_id, explanation)
    VALUES (
        p_booking_id, 
        v_staff_id, 
        jsonb_build_object(
            'action', 'cancel_booking',
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object('success', true, 'message', 'Hủy phòng thành công');
END;
$function$;


-- 2. UPDATE SECURITY SETTINGS
-- Insert missing keys and set APPROVAL mode
INSERT INTO public.settings_security (key, policy_type, description)
VALUES 
    ('folio_edit_booking', 'APPROVAL', 'Sửa thông tin Booking (Tên, Giờ, Giá)'),
    ('folio_change_room', 'DENY', 'Đổi phòng') -- Re-affirm DENY, though it might exist
ON CONFLICT (key) DO UPDATE 
SET policy_type = EXCLUDED.policy_type;

-- Force update specific sensitive actions to APPROVAL
UPDATE public.settings_security
SET policy_type = 'APPROVAL'
WHERE key IN ('checkin_cancel_booking', 'folio_edit_booking');

-- Ensure folio_change_room is DENY as per current state (or APPROVAL if user wants, but user said 'Change Room' filter logic was important, let's keep DENY or APPROVAL? 
-- Wait, user didn't say Change Room is forbidden, user said "Change Room: Only to ready rooms".
-- User complained about "Global là XIN LỆNH" for "Sửa phòng" (Edit Booking).
-- Let's set 'folio_change_room' to 'PIN' or 'APPROVAL' to be safe, NOT DENY. 
-- User previously said: "1. Đổi phòng xong thì về lại sơ đồ phòng nhé". So it IS allowed.
-- My previous report said it was DENY in DB. That was why it was blocked (or bypassed).
-- I should set it to PIN or APPROVAL.
UPDATE public.settings_security
SET policy_type = 'PIN' -- Default to PIN for Change Room, unless user said otherwise. 
WHERE key = 'folio_change_room';

-- Verify Clean State
SELECT routine_name, pg_get_function_identity_arguments(to_regproc(routine_name::text)) as args
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('update_booking_details', 'cancel_booking')
ORDER BY routine_name;
