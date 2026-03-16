-- 1. Thêm ví DEBT (Công nợ khách) cho toàn bộ hotel
INSERT INTO public.wallets (id, name, balance, hotel_id)
SELECT 'DEBT', 'Công nợ khách', 0, hotel_id
FROM (SELECT DISTINCT hotel_id FROM public.wallets) h
ON CONFLICT (id, hotel_id) DO NOTHING;

-- 2. Cập nhật fn_sync_wallets: Phân định rạch ròi Công nợ tạm (RECEIVABLE) và Công nợ khách (DEBT)
CREATE OR REPLACE FUNCTION public.fn_sync_wallets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ 
DECLARE 
    v_delta NUMERIC; 
    v_flow_sign INTEGER; 
    v_method TEXT; 
    v_rec RECORD; 
    v_is_revenue BOOLEAN;
BEGIN 
    -- Bỏ qua nếu là giao dịch điều chỉnh trực tiếp (đã được xử lý ở fn_adjust_wallet_balance)
    IF NEW.category = 'Điều chỉnh' AND NEW.is_auto = true THEN
        RETURN NEW;
    END IF;

    -- Xác định biến động (INSERT/UPDATE/DELETE)
    IF (TG_OP = 'DELETE') THEN v_rec := OLD; v_delta := -COALESCE(OLD.amount, 0); 
    ELSIF (TG_OP = 'INSERT') THEN v_rec := NEW; v_delta := COALESCE(NEW.amount, 0); 
    ELSE v_rec := NEW; v_delta := COALESCE(NEW.amount, 0) - COALESCE(OLD.amount, 0); END IF; 

    IF v_delta = 0 AND TG_OP = 'UPDATE' THEN RETURN NEW; END IF; 

    v_flow_sign := CASE WHEN v_rec.flow_type = 'IN' THEN 1 ELSE -1 END; 
    v_method := lower(COALESCE(v_rec.payment_method_code, 'cash')); 

    -- Kiểm tra xem hạng mục này có được tính vào doanh thu không
    SELECT is_revenue INTO v_is_revenue FROM public.cash_flow_categories 
    WHERE name = v_rec.category AND (hotel_id = v_rec.hotel_id OR hotel_id IS NULL) LIMIT 1; 
    v_is_revenue := COALESCE(v_is_revenue, true);

    -- [A] LOGIC VÍ TIỀN MẶT / NGÂN HÀNG
    IF v_method IN ('cash', 'bank') THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = UPPER(v_method) AND hotel_id = v_rec.hotel_id;
        
        -- Nếu là Thanh toán phòng/Tiền cọc -> Giảm Công nợ tạm (RECEIVABLE)
        IF v_rec.category IN ('Thanh toán', 'Tiền cọc') THEN
            UPDATE public.wallets SET balance = balance - (v_delta * v_flow_sign), updated_at = now()
            WHERE id = 'RECEIVABLE' AND hotel_id = v_rec.hotel_id;
        END IF;

        -- Nếu là Thu nợ khách -> Giảm Công nợ khách (DEBT)
        IF v_rec.category IN ('Thu nợ khách') THEN
            UPDATE public.wallets SET balance = balance - (v_delta * v_flow_sign), updated_at = now()
            WHERE id = 'DEBT' AND hotel_id = v_rec.hotel_id;
        END IF;
    END IF;

    -- [B] LOGIC CÔNG NỢ TẠM (RECEIVABLE) khi ghi nợ (Credit)
    IF v_method = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'RECEIVABLE' AND hotel_id = v_rec.hotel_id;
    END IF;

    -- [C] LOGIC SỔ DOANH THU (REVENUE)
    -- CHỈ ghi nhận khi: flow_type = 'IN' (THU) VÀ có is_revenue = true VÀ không phải thu nợ/cọc/thanh toán
    IF v_rec.flow_type = 'IN' 
       AND v_is_revenue 
       AND v_rec.category NOT IN ('Thu nợ khách', 'Thanh toán', 'Tiền cọc') THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'REVENUE' AND hotel_id = v_rec.hotel_id;
    END IF;

    RETURN NULL; 
END; $function$;

-- 3. Cập nhật fn_adjust_wallet_balance để hỗ trợ mọi loại ví
CREATE OR REPLACE FUNCTION public.fn_adjust_wallet_balance(p_wallet_id text, p_actual_balance numeric, p_reason text, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_current_balance numeric;
    v_diff numeric;
    v_flow_type text;
    v_hotel_id uuid;
    v_staff_id uuid;
    v_staff_name text;
    v_new_id uuid;
BEGIN
    v_hotel_id := public.fn_get_tenant_id();
    IF v_hotel_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi bảo mật: Không xác định được định danh khách sạn.');
    END IF;

    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id AND hotel_id = v_hotel_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    -- Lấy số dư hiện tại và khóa hàng để tránh race condition
    SELECT balance INTO v_current_balance 
    FROM public.wallets 
    WHERE id = p_wallet_id AND hotel_id = v_hotel_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy quỹ: ' || p_wallet_id);
    END IF;

    v_diff := p_actual_balance - v_current_balance;
    IF v_diff = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Số dư đã khớp, không cần điều chỉnh.');
    END IF;

    v_flow_type := CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END;

    -- 1. Cập nhật ví TRỰC TIẾP
    UPDATE public.wallets 
    SET balance = p_actual_balance, updated_at = now()
    WHERE id = p_wallet_id AND hotel_id = v_hotel_id;

    -- 2. Ghi log vào cash_flow (Sử dụng category 'Điều chỉnh' và is_auto = true để Trigger fn_sync_wallets bỏ qua, tránh double-counting)
    INSERT INTO public.cash_flow (
        hotel_id, flow_type, category, amount, description, 
        occurred_at, created_by, verified_by_staff_id, verified_by_staff_name, 
        payment_method_code, is_auto
    )
    VALUES (
        v_hotel_id, v_flow_type, 'Điều chỉnh', ABS(v_diff),
        'Điều chỉnh quỹ ' || p_wallet_id || ': ' || COALESCE(p_reason, '') || ' (Hệ thống: ' || v_current_balance || ', Thực tế: ' || p_actual_balance || ')',
        now(), v_staff_id, v_staff_id, v_staff_name,
        'manual', true
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'message', 'Điều chỉnh số dư thành công', 'data', jsonb_build_object('id', v_new_id, 'diff', v_diff, 'new_balance', p_actual_balance));
END;
$function$;

-- 4. ĐỒNG BỘ LẠI SỐ DƯ VÍ DEBT (Khách đã đi)
DO $$
DECLARE
    r RECORD;
    v_actual_debt NUMERIC;
BEGIN
    FOR r IN SELECT DISTINCT hotel_id FROM public.wallets LOOP
        -- Tổng số nợ hiện tại của khách hàng trong bảng customers
        SELECT COALESCE(SUM(ABS(balance)), 0)
        INTO v_actual_debt
        FROM public.customers
        WHERE hotel_id = r.hotel_id AND balance < 0;

        -- Cập nhật lại ví DEBT
        UPDATE public.wallets 
        SET balance = v_actual_debt, updated_at = now()
        WHERE id = 'DEBT' AND hotel_id = r.hotel_id;
    END LOOP;
END $$;

-- 5. THIẾT LẬP LIÊN KẾT CHO SỔ CÁI DỰ THU (Để hiển thị chi tiết)
-- Thêm Foreign Key nếu chưa có để Supabase có thể JOIN dữ liệu
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_ledger_booking' AND table_name = 'daily_expected_ledger'
    ) THEN
        ALTER TABLE public.daily_expected_ledger 
        ADD CONSTRAINT fk_ledger_booking 
        FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 6. ĐƠN GIẢN HÓA CÔNG THỨC DỰ THU (EXPECTED REVENUE) & CẬP NHẬT MÔ TẢ THÂN THIỆN
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_bookings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_bill jsonb;
    v_amount numeric;
    v_is_checkin boolean := false;
    v_room_number text;
    v_rental_type_desc text;
BEGIN
    -- Lấy thông tin phòng
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = NEW.room_id;
    v_room_number := COALESCE(v_room_number, '??');
    
    -- Mô tả loại hình thuê
    v_rental_type_desc := CASE 
        WHEN NEW.rental_type = 'hourly' THEN 'GIỜ' 
        WHEN NEW.rental_type = 'daily' THEN 'NGÀY' 
        WHEN NEW.rental_type = 'overnight' THEN 'ĐÊM'
        WHEN NEW.rental_type = 'monthly' THEN 'THÁNG'
        ELSE NEW.rental_type 
    END;

    -- Xác định sự kiện Check-in
    IF (TG_OP = 'INSERT' AND NEW.status = 'checked_in') THEN
        v_is_checkin := true;
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != 'checked_in' AND NEW.status = 'checked_in') THEN
        v_is_checkin := true;
    END IF;

    -- [A] CHECK-IN (Chỉ cho phòng Ngày/Đêm/Tháng)
    IF v_is_checkin AND NEW.rental_type != 'hourly' THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_in_actual);
        v_amount := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric;
        
        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (NEW.hotel_id, NEW.id, v_amount, 'P.' || v_room_number || ' Check in phòng ' || v_rental_type_desc, 'CHECK_IN');
    END IF;

    -- [B] CHECK-OUT (Phòng giờ)
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'completed' AND NEW.rental_type = 'hourly') THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_out_actual);
        v_amount := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric;
        
        IF v_amount > 0 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, v_amount, 'P.' || v_room_number || ' Check out phòng ' || v_rental_type_desc, 'CHECK_OUT');
        END IF;
    END IF;

    -- [C] HỦY PHÒNG
    IF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
        SELECT SUM(amount) INTO v_amount FROM public.daily_expected_ledger WHERE booking_id = NEW.id;
        IF v_amount IS NOT NULL AND v_amount != 0 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, -v_amount, 'P.' || v_room_number || ' Hủy phòng, hoàn lại', 'CANCEL');
        END IF;
    END IF;

    -- [D] ĐIỀU CHỈNH GIÁ
    IF (TG_OP = 'UPDATE' AND NEW.status = 'checked_in' AND OLD.custom_price != NEW.custom_price AND NEW.rental_type != 'hourly') THEN
        v_amount := COALESCE(NEW.custom_price, 0) - COALESCE(OLD.custom_price, 0);
        IF v_amount != 0 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, v_amount, 'P.' || v_room_number || ' Đổi giá phòng ' || v_rental_type_desc, 'ADJUST');
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 7. KHẮC PHỤC LỖI CỘNG TRÙNG & CẬP NHẬT MÔ TẢ STAY-OVER
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_milestones()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_checkin_date date;
    v_room_number text;
    v_rental_type_desc text;
BEGIN
    -- Lấy thông tin phòng và loại hình thuê
    SELECT b.check_in_actual::date, r.room_number, 
           CASE 
             WHEN b.rental_type = 'hourly' THEN 'GIỜ' 
             WHEN b.rental_type = 'daily' THEN 'NGÀY' 
             WHEN b.rental_type = 'overnight' THEN 'ĐÊM'
             WHEN b.rental_type = 'monthly' THEN 'THÁNG'
             ELSE b.rental_type 
           END
    INTO v_checkin_date, v_room_number, v_rental_type_desc
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = NEW.ref_id;

    IF (NEW.is_auto = true AND NEW.category = 'Tiền phòng' AND NEW.payment_method_code = 'credit') THEN
        IF (NEW.occurred_at::date > v_checkin_date) THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.ref_id, NEW.amount, 'P.' || v_room_number || ' Ở thêm phòng ' || v_rental_type_desc, 'MILESTONE');
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Cập nhật trigger dịch vụ
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_services()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
    v_booking_id uuid;
    v_price numeric;
    v_quantity numeric;
    v_service_name text;
    v_room_number text;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_booking_id := OLD.booking_id;
        v_quantity := -OLD.quantity;
        v_price := COALESCE(OLD.price_at_time, (SELECT price FROM public.services WHERE id = OLD.service_id));
        SELECT name INTO v_service_name FROM public.services WHERE id = OLD.service_id;
    ELSE
        v_booking_id := NEW.booking_id;
        v_quantity := NEW.quantity;
        v_price := COALESCE(NEW.price_at_time, (SELECT price FROM public.services WHERE id = NEW.service_id));
        SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;
    END IF;

    -- Lấy thông tin hotel và room number
    SELECT b.hotel_id, r.room_number INTO v_hotel_id, v_room_number 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = v_booking_id;

    IF v_hotel_id IS NOT NULL THEN
        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (v_hotel_id, v_booking_id, v_quantity * v_price, 'P.' || v_room_number || ' Dùng ' || COALESCE(v_service_name, 'dịch vụ'), 'SERVICE');
    END IF;

    RETURN NULL;
END;
$function$;

-- 8. KẾT THÚC SCRIPT
-- Lưu ý: Đã loại bỏ lệnh DELETE dữ liệu cũ để bảo toàn lịch sử dự thu.
