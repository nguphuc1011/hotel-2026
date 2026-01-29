const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
});

const sql = `
CREATE OR REPLACE FUNCTION public.check_in_customer(p_room_id uuid, p_rental_type text, p_customer_id uuid DEFAULT NULL::uuid, p_deposit numeric DEFAULT 0, p_services jsonb DEFAULT '[]'::jsonb, p_customer_name text DEFAULT NULL::text, p_extra_adults integer DEFAULT 0, p_extra_children integer DEFAULT 0, p_notes text DEFAULT NULL::text, p_custom_price numeric DEFAULT NULL::numeric, p_custom_price_reason text DEFAULT NULL::text, p_source text DEFAULT 'direct'::text, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
        INSERT INTO public.customers (full_name) VALUES (p_customer_name) RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    -- 1. Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, check_in_actual, deposit_amount, payment_method, 
        status, notes, services_used, extra_adults, extra_children, 
        custom_price, custom_price_reason, source, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, v_check_in_at, p_deposit, p_payment_method, 
        'checked_in', p_notes, p_services, p_extra_adults, p_extra_children, 
        p_custom_price, p_custom_price_reason, p_source, v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name)
    ) RETURNING id INTO v_booking_id;

    -- 2. Update Room Status
    UPDATE public.rooms SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = v_check_in_at WHERE id = p_room_id;

    -- 3. INITIAL ROOM CHARGE (Snapshot Principle)
    -- [FIX] Use calculate_booking_bill to include all surcharges at check-in
    DECLARE
        v_full_bill jsonb;
        v_initial_amount numeric;
    BEGIN
        v_full_bill := public.calculate_booking_bill(v_booking_id, v_check_in_at);
        v_initial_amount := (v_full_bill->>'total_amount')::numeric;

        -- Hourly Room starts with 0 Debt (Snapshot Principle)
        IF p_rental_type = 'hourly' THEN
            v_initial_amount := 0;
        END IF;

        IF v_initial_amount > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, payment_method_code, 
                created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at
            )
            VALUES (
                'IN', 'Tiền phòng', v_initial_amount, 
                format('Ghi nhận nợ tiền phòng (%s) lúc nhận phòng - Bao gồm phụ thu (nếu có)', p_rental_type), 
                'credit', -- Increases Receivable & Revenue
                auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now()
            );
        END IF;
    END;

    -- 4. RECORD DEPOSIT
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, payment_method_code, 
            created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at
        )
        VALUES (
            'IN', 'Tiền cọc', p_deposit, 
            'Tiền cọc phòng ' || COALESCE(v_room_name, ''), 
            p_payment_method, -- cash/bank
            auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now()
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$;
`;

async function update() {
  try {
    await client.connect();
    await client.query(sql);
    console.log('Successfully updated check_in_customer function.');
  } catch (err) {
    console.error('Error updating function:', err);
  } finally {
    await client.end();
  }
}

update();
