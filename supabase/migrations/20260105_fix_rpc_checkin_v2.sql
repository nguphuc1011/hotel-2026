-- 1. Drop old handle_check_in to avoid signature mismatch
DROP FUNCTION IF EXISTS public.handle_check_in(uuid, text, uuid, text, text, text, text, timestamp with time zone, numeric, numeric, text, text, jsonb, boolean, uuid);

-- 2. Update handle_check_in to remove p_include_debt and related logic
CREATE OR REPLACE FUNCTION public.handle_check_in(
    p_room_id uuid,
    p_rental_type text,
    p_customer_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_customer_id_card text,
    p_customer_address text,
    p_check_in_at timestamp with time zone,
    p_initial_price numeric,
    p_deposit_amount numeric,
    p_deposit_method text,
    p_notes text,
    p_services_used jsonb,
    p_staff_id uuid DEFAULT NULL::uuid
)
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
    INSERT INTO customers (full_name, phone, id_card, address)
    VALUES (p_customer_name, p_customer_phone, p_customer_id_card, p_customer_address)
    ON CONFLICT (phone) WHERE phone IS NOT NULL DO UPDATE SET 
      full_name = EXCLUDED.full_name,
      id_card = COALESCE(customers.id_card, EXCLUDED.id_card),
      address = COALESCE(customers.address, EXCLUDED.address)
    RETURNING id INTO v_customer_id;
  END IF;

  -- 2. Tạo Booking mới (Đã xóa include_debt và merged_debt_amount)
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
    balance = COALESCE(balance, 0) - p_deposit_amount -- Tiền cọc làm giảm nợ (hoặc tăng tiền dư)
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

-- Update handle_checkout to remove usage of dropped columns
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid, 
    p_notes text DEFAULT NULL::text, 
    p_payment_method text DEFAULT 'CASH'::text, 
    p_surcharge numeric DEFAULT 0, 
    p_total_amount numeric DEFAULT NULL::numeric, 
    p_amount_paid numeric DEFAULT NULL::numeric, 
    p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_booking RECORD;
  v_customer_id UUID;
  v_final_amount NUMERIC; 
  v_deposit NUMERIC;
  v_amount_paid NUMERIC; 
  v_debt_adjustment NUMERIC; 
  v_staff_id UUID := p_staff_id;
BEGIN
  -- Lấy staff_id nếu không truyền vào
  IF v_staff_id IS NULL THEN
    v_staff_id := auth.uid();
  END IF;

  -- 1. Lấy thông tin đơn đặt phòng
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đơn đặt phòng');
  END IF;

  v_customer_id := v_booking.customer_id;
  v_deposit := COALESCE(v_booking.deposit_amount, 0);
  v_final_amount := COALESCE(p_total_amount, 0);
  v_amount_paid := COALESCE(p_amount_paid, v_final_amount);
  
  -- 2. Cập nhật đơn đặt phòng (Đã xóa amount_paid column)
  UPDATE bookings 
  SET 
    check_out_at = NOW(),
    status = 'completed',
    notes = COALESCE(p_notes, notes),
    total_amount = v_final_amount + v_deposit -- Tổng giá trị thực tế của đơn này
  WHERE id = p_booking_id;

  -- 3. Cập nhật số dư khách hàng và Tổng chi tiêu (Loyalty)
  -- balance > 0 là Nợ, < 0 là Dư.
  -- Balance mới = Balance cũ + (Tổng Bill) - (Thanh toán thêm lúc checkout)
  -- Trong đó v_final_amount = Tổng Bill - Deposit.
  -- Vậy: Balance mới = Balance cũ + (v_final_amount + v_deposit) - v_amount_paid
  UPDATE customers
  SET
    total_spent = COALESCE(total_spent, 0) + (v_final_amount + v_deposit),
    balance = COALESCE(balance, 0) + (v_final_amount + v_deposit) - v_amount_paid
  WHERE id = v_customer_id;

  -- 4. Ghi nhận Ledger (Thanh toán & Biến động nợ)
  
  -- A. Ghi nhận DOANH THU (Revenue) - Số dương làm tăng nợ
  INSERT INTO ledger (
    booking_id, customer_id, staff_id, type, category, amount, description, created_at
  ) VALUES (
    p_booking_id, v_customer_id, v_staff_id, 'REVENUE', 'ROOM', (v_final_amount + v_deposit), 'Doanh thu phòng & dịch vụ', NOW()
  );

  -- B. Ghi nhận THANH TOÁN (Payment) - Số tiền khách thực trả hôm nay
  IF v_amount_paid > 0 THEN
    INSERT INTO ledger (
      booking_id, customer_id, staff_id, type, category, amount, payment_method_code, description, created_at
    ) VALUES (
      p_booking_id, v_customer_id, v_staff_id, 'PAYMENT', 'ROOM', v_amount_paid, p_payment_method, 'Thanh toán checkout', NOW()
    );
  END IF;

  -- C. Nếu có trả lại tiền cọc (thực tế cọc đã được cộng vào Payment hoặc trừ vào Revenue)
  -- Logic Ledger mới: balance = SUM(PAYMENT + DEBT_ADJUSTMENT + REFUND)
  -- Ở đây v_amount_paid - v_final_amount chính là phần nợ mới hoặc trả dư.
  
  v_debt_adjustment := v_amount_paid - v_final_amount;
  
  -- Nếu v_debt_adjustment < 0 tức là khách nợ thêm
  -- Nếu v_debt_adjustment > 0 tức là khách trả dư (hoặc trả nợ cũ)
  
  -- 5. Cập nhật trạng thái phòng
  UPDATE rooms 
  SET 
    status = 'dirty',
    current_booking_id = NULL,
    last_status_change = NOW()
  WHERE id = v_booking.room_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Trả phòng thành công',
    'balance_change', v_debt_adjustment
  );
END;
$function$;
