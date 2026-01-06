
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    const sql = `
CREATE OR REPLACE FUNCTION public.handle_check_in(p_room_id uuid, p_rental_type text, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_customer_id_card text, p_customer_address text, p_check_in_at timestamp with time zone, p_initial_price numeric, p_deposit_amount numeric, p_deposit_method text, p_notes text, p_services_used jsonb, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_customer_id UUID;
  v_booking_id UUID;
  v_staff_id UUID := p_staff_id;
BEGIN
  -- Lấy staff_id nếu không truyền vào
  IF v_staff_id IS NULL THEN
    v_staff_id := auth.uid();
  END IF;

  -- 1. Xử lý khách hàng (Tìm hoặc Tạo mới)
  IF p_customer_id IS NOT NULL THEN
    v_customer_id := p_customer_id;
  ELSE
    -- Tìm khách hàng theo số điện thoại nếu có
    IF p_customer_phone IS NOT NULL AND p_customer_phone != '' THEN
        SELECT id INTO v_customer_id FROM customers WHERE phone = p_customer_phone LIMIT 1;
        
        IF v_customer_id IS NOT NULL THEN
            -- Update thông tin nếu tìm thấy
            UPDATE customers SET 
                full_name = p_customer_name,
                id_card = COALESCE(customers.id_card, p_customer_id_card),
                address = COALESCE(customers.address, p_customer_address)
            WHERE id = v_customer_id;
        END IF;
    END IF;

    -- Nếu vẫn chưa có customer_id (không tìm thấy hoặc không có phone), tạo mới
    IF v_customer_id IS NULL THEN
        INSERT INTO customers (full_name, phone, id_card, address)
        VALUES (p_customer_name, p_customer_phone, p_customer_id_card, p_customer_address)
        RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- 2. Tạo Booking mới
  INSERT INTO bookings (
    room_id, customer_id, rental_type, check_in_at, 
    initial_price, deposit_amount, payment_method, 
    notes, services_used, status
  ) VALUES (
    p_room_id, v_customer_id, p_rental_type, p_check_in_at,
    p_initial_price, p_deposit_amount, p_deposit_method,
    p_notes, p_services_used, 'active'
  ) RETURNING id INTO v_booking_id;

  -- 3. Cập nhật visit_count và last_visit cho khách
  UPDATE customers 
  SET 
    visit_count = COALESCE(visit_count, 0) + 1,
    last_visit = p_check_in_at,
    balance = COALESCE(balance, 0) - p_deposit_amount
  WHERE id = v_customer_id;

  -- 4. Ghi nhận Tiền cọc vào Ledger (nếu có)
  IF p_deposit_amount > 0 THEN
    INSERT INTO ledger (
      booking_id, customer_id, staff_id, type, category, amount, payment_method_code, description, created_at
    ) VALUES (
      v_booking_id, v_customer_id, v_staff_id, 'DEPOSIT', 'ROOM', p_deposit_amount, p_deposit_method, 'Tiền cọc nhận phòng', NOW()
    );
  END IF;

  -- 5. Cập nhật trạng thái phòng
  UPDATE rooms 
  SET 
    status = CASE 
      WHEN p_rental_type = 'daily' THEN 'daily'
      WHEN p_rental_type = 'overnight' THEN 'overnight'
      ELSE 'hourly'
    END,
    current_booking_id = v_booking_id,
    last_status_change = NOW()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'customer_id', v_customer_id
  );
END;
$function$;
    `;
    
    await client.query(sql);
    console.log('Updated handle_check_in function successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

runMigration();
