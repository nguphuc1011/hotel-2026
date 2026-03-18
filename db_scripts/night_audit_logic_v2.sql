-- NIGHT AUDIT LOGIC V2 (Dự thu Milestone Sync)
-- Căn cứ: Điều 8 & Điều 10 Hiến pháp 1hotel2
-- Mô tả: Tự động ghi nhận doanh thu dự thu (Accrual) cho khách ở nhiều ngày vào Sổ Dự thu.

-- DROP old version with different parameter name
DROP FUNCTION IF EXISTS public.fn_perform_night_audit(uuid);

CREATE OR REPLACE FUNCTION public.fn_perform_night_audit(p_hotel_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_booking RECORD;
    v_current_bill jsonb;
    v_recorded_ledger_amount numeric;
    v_new_ledger_amount numeric;
    v_count int := 0;
    v_total_amount numeric := 0;
    v_night_audit_time time;
    v_today_audit_threshold timestamptz;
    v_last_audit_marker timestamptz;
BEGIN
    -- 1. Xác định hotel_id
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    IF v_hotel_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không xác định được Hotel ID');
    END IF;

    -- 2. Lấy cấu hình giờ chốt sổ
    SELECT COALESCE(night_audit_time, '04:00:00')::time INTO v_night_audit_time
    FROM public.settings WHERE hotel_id = v_hotel_id OR hotel_id IS NULL 
    ORDER BY hotel_id NULLS LAST LIMIT 1;

    -- 3. Kiểm tra xem hôm nay đã chạy chưa (Tránh chạy trùng)
    -- Mốc audit của ngày hôm nay theo múi giờ VN
    v_today_audit_threshold := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_night_audit_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';
    
    -- Nếu bây giờ chưa đến giờ audit của hôm nay, mốc so sánh là ngày hôm qua
    IF now() < v_today_audit_threshold THEN
        v_today_audit_threshold := v_today_audit_threshold - INTERVAL '1 day';
    END IF;

    SELECT MAX(created_at) INTO v_last_audit_marker 
    FROM public.daily_expected_ledger 
    WHERE hotel_id = v_hotel_id AND event_type = 'NIGHT_AUDIT_MARKER';

    IF v_last_audit_marker >= v_today_audit_threshold THEN
        RETURN jsonb_build_object('success', true, 'message', 'Night Audit đã được thực hiện cho kỳ này.', 'last_run', v_last_audit_marker);
    END IF;

    -- 4. Quét toàn bộ phòng đang ở (Checked-in)
    FOR v_booking IN 
        SELECT b.id, b.room_id, b.rental_type, r.category_id, r.room_number
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        WHERE b.status = 'checked_in' AND b.hotel_id = v_hotel_id
    LOOP
        -- 4.1. Tính tổng tiền phòng + phụ thu LIVE tại thời điểm này
        v_current_bill := public.calculate_booking_bill(v_booking.id);
        
        -- 4.2. Lấy tổng số tiền đã ghi nhận trong Sổ Dự thu (daily_expected_ledger) cho booking này
        -- (Bao gồm CHECK_IN ban đầu và các MILESTONE trước đó)
        SELECT COALESCE(SUM(amount), 0) INTO v_recorded_ledger_amount
        FROM public.daily_expected_ledger
        WHERE booking_id = v_booking.id;

        -- 4.3. Tính phần chênh lệch (tiền phòng ngày mới phát sinh)
        v_new_ledger_amount := (v_current_bill->>'room_charge')::numeric + (v_current_bill->>'surcharge_amount')::numeric - v_recorded_ledger_amount;

        -- 4.4. Nếu có phát sinh thêm (do qua ngày mới), ghi vào Sổ Dự thu
        IF v_new_ledger_amount > 0 THEN
            INSERT INTO public.daily_expected_ledger (
                hotel_id, 
                booking_id, 
                amount, 
                description, 
                event_type
            )
            VALUES (
                v_hotel_id, 
                v_booking.id, 
                v_new_ledger_amount, 
                format('P.%s: Tăng tiền phòng/phụ thu ngày mới (Night Audit)', v_booking.room_number), 
                'MILESTONE'
            );
            
            v_count := v_count + 1;
            v_total_amount := v_total_amount + v_new_ledger_amount;
        END IF;
    END LOOP;

    -- 5. Đánh dấu đã hoàn tất Night Audit cho kỳ này
    INSERT INTO public.daily_expected_ledger (hotel_id, amount, description, event_type)
    VALUES (v_hotel_id, 0, 'Night Audit Marker', 'NIGHT_AUDIT_MARKER');

    RETURN jsonb_build_object(
        'success', true,
        'bookings_processed', v_count,
        'total_revenue_added', v_total_amount,
        'timestamp', now()
    );
END;
$$;
