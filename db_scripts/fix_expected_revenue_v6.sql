-- ====================================================================================
-- BẢN VÁ LỖI DỰ THU TOÀN DIỆN V6 (THEO MỐC TÍNH TIỀN THỰC TẾ)
-- 📜 Trích dẫn Điều 8: "Bộ não Backend là nguồn sự thật duy nhất."
-- 📜 Trích dẫn Điều 10: "Mọi sửa đổi phải dựa trên information_schema thực tế."
-- Mô tả: Tách biệt Mốc Night Audit (để reset 0) và Mốc Tính thêm ngày (để cộng tiền).
--        Đồng bộ Stay-over dựa trên kết quả thực tế của Billing Engine.
-- ====================================================================================

-- 1. Cập nhật hàm đồng bộ MILESTONE (Sử dụng Billing Engine làm chuẩn)
CREATE OR REPLACE FUNCTION public.fn_sync_stayover_milestones(p_hotel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking RECORD;
    v_bill jsonb;
    v_expected_days int;
    v_recorded_days int;
    v_price_daily numeric;
    v_room_number text;
BEGIN
    -- Quét toàn bộ phòng đang ở (Daily/Overnight/Monthly)
    FOR v_booking IN 
        SELECT b.id, r.room_number, b.hotel_id, b.custom_price,
               rc.price_daily as cat_price_daily, b.rental_type
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE b.status = 'checked_in' 
          AND b.rental_type != 'hourly' 
          AND b.hotel_id = p_hotel_id
    LOOP
        -- A. Lấy giá 1 ngày chuẩn
        v_price_daily := COALESCE(v_booking.custom_price, v_booking.cat_price_daily, 0);
        IF v_price_daily <= 0 THEN CONTINUE; END IF;

        -- B. Hỏi Billing Engine xem tính đến hiện tại là bao nhiêu ngày tiền phòng
        -- Hàm calculate_booking_bill đã bao gồm logic full_day_late_after trong settings
        v_bill := public.calculate_booking_bill(v_booking.id, now());
        v_expected_days := ROUND((v_bill->>'room_charge')::numeric / v_price_daily);

        -- C. Đếm số ngày đã ghi nhận trong Ledger (CHECK_IN + MILESTONE)
        -- Lưu ý: CHECK_IN luôn đại diện cho ngày đầu tiên
        SELECT COUNT(*)::int INTO v_recorded_days
        FROM public.daily_expected_ledger 
        WHERE booking_id = v_booking.id 
          AND event_type IN ('CHECK_IN', 'MILESTONE');

        -- D. Nếu số ngày thực tế > số ngày đã ghi nhận -> Cộng thêm MILESTONE
        -- Ví dụ: expected = 2, recorded = 1 -> Cần thêm 1 MILESTONE
        WHILE v_expected_days > v_recorded_days LOOP
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (v_booking.hotel_id, v_booking.id, v_price_daily, 'P.' || v_booking.room_number || ' Ở thêm ngày (Tự động)', 'MILESTONE');
            
            v_recorded_days := v_recorded_days + 1;
        END LOOP;
    END LOOP;
END;
$$;

-- 2. RPC lấy Dự thu (Sử dụng mốc Night Audit để reset 0)
CREATE OR REPLACE FUNCTION public.fn_get_daily_expected_revenue(p_hotel_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_threshold timestamptz;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    
    -- 1. Lấy mốc Night Audit để biết "Hôm nay" bắt đầu từ lúc nào (Chỉ để filter SUM)
    v_threshold := public.fn_get_current_night_audit_threshold(v_hotel_id);

    -- 2. Đồng bộ Stay-over (Chỉ cộng thêm MILESTONE nếu Billing Engine bảo đã sang ngày mới)
    PERFORM public.fn_sync_stayover_milestones(v_hotel_id);
    
    -- 3. Trả về tổng biến động từ mốc Night Audit đến nay
    RETURN (
        SELECT COALESCE(SUM(amount), 0) 
        FROM public.daily_expected_ledger 
        WHERE hotel_id = v_hotel_id AND created_at >= v_threshold
    );
END;
$$;

-- 3. Thông báo hoàn tất
NOTIFY pgrst, 'reload schema';
