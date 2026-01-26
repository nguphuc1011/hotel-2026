
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

const sql = `
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
        notes = COALESCE(notes, '') || E'\\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Record Cash Flow (Dòng tiền)
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
                'Tiền phòng', 
                p_amount_paid, 
                'Thanh toán checkout phòng ' || COALESCE(v_bill->>'room_name', '???') || ' - ' || COALESCE(v_bill->>'customer_name', 'Khách lẻ'), 
                v_staff_id, 
                p_booking_id, 
                true, 
                now(),
                lower(p_payment_method) -- FIX: Force lowercase to match wallet triggers
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN 
        -- Log error to audit_logs instead of silent fail
        INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
        VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, 0, to_jsonb(ARRAY['Lỗi ghi nhận dòng tiền: ' || SQLERRM]));
    END;

    -- 5. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 6. Record Audit Log (Lưu vết tính toán)
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- 7. Lưu giải trình vào Booking (Audit Trail)
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$$;
`;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Applying Fix to process_checkout ---');
    await client.query(sql);
    console.log('Success: process_checkout updated with SECURITY DEFINER and lower(payment_method)');
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
