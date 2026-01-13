
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const sql = `
CREATE OR REPLACE FUNCTION calculate_booking_bill_v2(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    -- Data Records
    v_booking RECORD;
    v_room_cat RECORD;
    v_settings RECORD;
    
    -- Time Variables
    v_check_in timestamptz;
    v_check_out timestamptz;
    v_now timestamptz := now();
    v_duration interval;
    v_duration_min numeric;
    v_duration_text text;
    v_billable_min numeric;
    
    -- Config Variables
    v_grace_minutes int;
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_hourly_unit int;
    v_base_block int;
    v_vat_percent numeric;
    v_service_fee_percent numeric;
    v_std_check_in time;
    v_std_check_out time;
    v_hourly_ceiling_enabled boolean;
    
    -- Pricing Variables
    v_room_price numeric := 0;
    v_surcharge_amount numeric := 0;
    v_early_surcharge numeric := 0;
    v_late_surcharge numeric := 0;
    v_service_total numeric := 0;
    v_service_fee_val numeric := 0;
    v_vat_val numeric := 0;
    v_total_amount numeric := 0;
    v_subtotal numeric := 0;
    v_final_amount numeric := 0;
    v_discount numeric := 0;
    v_deposit numeric := 0;
    v_customer_balance numeric := 0;
    
    -- Helpers
    v_rule jsonb;
    v_early_minutes numeric;
    v_late_minutes numeric;
    v_services jsonb;
    v_extra_min numeric;
    v_extra_blocks numeric;
    v_base_price numeric;
    v_next_price numeric;
    v_daily_price numeric;
    v_overnight_price numeric;
    
    -- Timezone (TODO: Load from settings)
    v_timezone text := 'Asia/Ho_Chi_Minh';
    
BEGIN
    -- 1. LOAD SETTINGS (Use key='config' or 'system_settings' fallback)
    -- We assume 'config' is the active one used by Frontend
    SELECT * INTO v_settings FROM settings WHERE key = 'config';
    
    IF v_settings.key IS NULL THEN
        -- Fallback to system_settings if config not found
        SELECT * INTO v_settings FROM settings WHERE key = 'system_settings';
    END IF;

    IF v_settings.key IS NULL THEN
        -- Defaults
        v_grace_minutes := 0;
        v_hourly_unit := 60;
        v_base_block := 1;
        v_vat_percent := 0;
        v_service_fee_percent := 0;
        v_std_check_in := '14:00:00';
        v_std_check_out := '12:00:00';
        v_hourly_ceiling_enabled := false;
    ELSE
        v_grace_minutes := COALESCE(v_settings.grace_minutes, 0);
        v_grace_in_enabled := COALESCE(v_settings.grace_in_enabled, false);
        v_grace_out_enabled := COALESCE(v_settings.grace_out_enabled, false);
        v_hourly_unit := COALESCE(v_settings.hourly_unit, 60);
        v_base_block := COALESCE(v_settings.base_hourly_limit, 1);
        v_vat_percent := CASE WHEN v_settings.vat_enabled THEN COALESCE(v_settings.vat_percent, 0) ELSE 0 END;
        v_service_fee_percent := CASE WHEN v_settings.service_fee_enabled THEN COALESCE(v_settings.service_fee_percent, 0) ELSE 0 END;
        v_std_check_in := (v_settings.check_in_time)::time;
        v_std_check_out := (v_settings.check_out_time)::time;
        v_hourly_ceiling_enabled := COALESCE(v_settings.hourly_ceiling_enabled, false);
    END IF;

    -- 2. LOAD BOOKING & CUSTOMER
    SELECT 
        b.*, 
        c.full_name as customer_name,
        r.room_number,
        COALESCE(c.balance, 0) as customer_balance
    INTO v_booking
    FROM bookings b
    LEFT JOIN customers c ON b.customer_id = c.id
    LEFT JOIN rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;

    IF v_booking.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking not found');
    END IF;
    
    v_customer_balance := v_booking.customer_balance;
    v_deposit := COALESCE(v_booking.deposit_amount, 0);
    v_discount := COALESCE(v_booking.discount_amount, 0);

    -- 3. LOAD ROOM CATEGORY PRICES
    SELECT * INTO v_room_cat
    FROM room_categories rc
    JOIN rooms r ON r.category_id = rc.id
    WHERE r.id = v_booking.room_id;

    -- 4. TIME CALCULATION
    v_check_in := v_booking.check_in_actual;
    v_check_out := COALESCE(v_booking.check_out_actual, v_now);
    v_duration := v_check_out - v_check_in;
    v_duration_min := EXTRACT(EPOCH FROM v_duration) / 60;
    
    -- Format duration text
    v_duration_text := 
        FLOOR(v_duration_min / 1440) || ' ngày ' || 
        FLOOR((v_duration_min % 1440) / 60) || ' giờ ' || 
        ROUND(v_duration_min % 60) || ' phút';

    -- 5. ROOM CHARGE CALCULATION
    -- Extract prices from flat columns
    v_base_price := COALESCE(v_room_cat.price_hourly, 0);
    v_next_price := COALESCE(v_room_cat.price_next_hour, 0);
    v_daily_price := COALESCE(v_room_cat.price_daily, 0);
    v_overnight_price := COALESCE(v_room_cat.price_overnight, 0);

    IF v_booking.rental_type = 'daily' THEN
        v_room_price := v_daily_price;
        
        -- Daily Calculation Logic (Simplified for now)
        -- TODO: Handle multiple days
        
    ELSIF v_booking.rental_type = 'overnight' THEN
        v_room_price := v_overnight_price;
    ELSE
        -- Hourly
        v_room_price := v_base_price;
        -- TODO: Hourly logic
    END IF;

    -- 6. SURCHARGE CALCULATION (Minutes Offset Logic)
    
    -- 6.1 Early Check-in
    -- Calculate minutes early relative to standard check-in
    -- Only relevant if check-in is BEFORE standard check-in on the same day (or previous?)
    -- For simplicity: Extract time part
    IF (v_check_in AT TIME ZONE v_timezone)::time < v_std_check_in THEN
        v_early_minutes := EXTRACT(EPOCH FROM (v_std_check_in - (v_check_in AT TIME ZONE v_timezone)::time)) / 60;
        
        -- Apply Grace Period
        IF v_grace_in_enabled AND v_early_minutes <= v_grace_minutes THEN
             v_early_minutes := 0;
        END IF;
        
        IF v_early_minutes > 0 THEN
            -- Find matching rule: from_minute < early_minutes <= to_minute
            SELECT * INTO v_rule
            FROM jsonb_array_elements(v_settings.surcharge_rules) rule
            WHERE (rule->>'type') = 'Early'
              AND v_early_minutes > (rule->>'from_minute')::numeric
              AND v_early_minutes <= (rule->>'to_minute')::numeric
            ORDER BY (rule->>'to_minute')::numeric DESC
            LIMIT 1;
            
            IF v_rule IS NOT NULL THEN
                v_early_surcharge := v_daily_price * ((rule->>'percentage')::numeric / 100);
            END IF;
        END IF;
    END IF;

    -- 6.2 Late Check-out
    -- Calculate minutes late relative to standard check-out
    IF (v_check_out AT TIME ZONE v_timezone)::time > v_std_check_out THEN
        v_late_minutes := EXTRACT(EPOCH FROM ((v_check_out AT TIME ZONE v_timezone)::time - v_std_check_out)) / 60;
        
        -- Apply Grace Period
        IF v_grace_out_enabled AND v_late_minutes <= v_grace_minutes THEN
            v_late_minutes := 0;
        END IF;
        
        IF v_late_minutes > 0 THEN
            -- Find matching rule: from_minute < late_minutes <= to_minute
            SELECT * INTO v_rule
            FROM jsonb_array_elements(v_settings.surcharge_rules) rule
            WHERE (rule->>'type') = 'Late'
              AND v_late_minutes > (rule->>'from_minute')::numeric
              AND v_late_minutes <= (rule->>'to_minute')::numeric
            ORDER BY (rule->>'to_minute')::numeric DESC
            LIMIT 1;
            
            IF v_rule IS NOT NULL THEN
                v_late_surcharge := v_daily_price * ((v_rule->>'percentage')::numeric / 100);
            END IF;
        END IF;
    END IF;

    -- 6.3 Custom Surcharge
    v_surcharge_amount := v_early_surcharge + v_late_surcharge + COALESCE(v_booking.custom_surcharge, 0);

    -- 7. SERVICES
    -- Iterate services_used (jsonb array)
    -- format: [{id, quantity, price, name}]
    FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb))
    LOOP
        v_service_total := v_service_total + ((v_rule->>'quantity')::numeric * (v_rule->>'price')::numeric);
    END LOOP;

    -- 8. TOTALS
    v_subtotal := v_room_price + v_surcharge_amount + v_service_total - v_discount;
    
    -- VAT & Service Fee
    v_service_fee_val := v_subtotal * (v_service_fee_percent / 100);
    v_vat_val := (v_subtotal + v_service_fee_val) * (v_vat_percent / 100);
    
    v_final_amount := v_subtotal + v_service_fee_val + v_vat_val;
    
    -- 9. RETURN
    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'room_number', v_booking.room_number,
        'customer_name', v_booking.customer_name,
        'check_in_at', v_check_in,
        'check_out_at', v_check_out,
        'duration_min', v_duration_min,
        'duration_text', v_duration_text,
        'rental_type', v_booking.rental_type,
        
        'base_price', v_daily_price, -- Assuming daily for now
        'room_charge', v_room_price,
        
        'early_surcharge', v_early_surcharge,
        'late_surcharge', v_late_surcharge,
        'custom_surcharge', COALESCE(v_booking.custom_surcharge, 0),
        'service_total', v_service_total,
        'service_charges', COALESCE(v_booking.services_used, '[]'::jsonb),
        'discount_amount', v_discount,
        
        'subtotal', v_subtotal,
        'service_fee_percent', v_service_fee_percent,
        'service_fee_amount', v_service_fee_val,
        'vat_percent', v_vat_percent,
        'vat_amount', v_vat_val,
        
        'total_final', v_final_amount,
        'total_amount', v_final_amount, -- alias
        'amount_to_pay', v_final_amount - v_deposit,
        
        -- Debt
        'customer_balance', v_customer_balance,
        'total_receivable', (v_final_amount - v_deposit) - v_customer_balance
    );
END;
$function$;
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Connected to DB');
    
    await client.query(sql);
    console.log('RPC calculate_booking_bill_v2 updated successfully (Minutes Logic)');
    
  } catch (err) {
    console.error('Error updating RPC:', err);
  } finally {
    await client.end();
  }
}

main();
