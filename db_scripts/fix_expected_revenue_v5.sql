-- ====================================================================================
-- BẢN VÁ LỖI DỰ THU TOÀN DIỆN V5 (Incremental Stay-over)
-- 📜 Trích dẫn Điều 8: "Mọi logic tính toán BẮT BUỘC phải nằm trong Database."
-- 📜 Trích dẫn Điều 10: "Mọi sửa đổi phải dựa trên information_schema thực tế."
-- Mô tả: Sửa lỗi cộng dồn toàn bộ tiền phòng stay-over. 
--        Chỉ cộng duy nhất 01 ngày tiền phòng khi bước sang ngày mới.
-- ====================================================================================

-- 1. Cập nhật hàm đồng bộ MILESTONE (Chỉ cộng 1 ngày, không cộng dồn)
CREATE OR REPLACE FUNCTION public.fn_sync_stayover_milestones(p_hotel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking RECORD;
    v_threshold timestamptz;
    v_already_synced boolean;
    v_price_daily numeric;
BEGIN
    -- Xác định mốc Night Audit hiện tại (Ví dụ: 04:00 sáng nay)
    v_threshold := public.fn_get_current_night_audit_threshold(p_hotel_id);

    -- Quét toàn bộ phòng đang ở (Trừ phòng giờ)
    FOR v_booking IN 
        SELECT b.id, b.room_id, r.room_number, b.hotel_id, b.check_in_actual, b.custom_price,
               rc.price_daily as cat_price_daily
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE b.status = 'checked_in' 
          AND b.rental_type != 'hourly' 
          AND b.hotel_id = p_hotel_id
    LOOP
        -- A. Xác định giá 1 ngày (Ưu tiên giá thỏa thuận/custom_price nếu có)
        v_price_daily := COALESCE(v_booking.custom_price, v_booking.cat_price_daily, 0);

        -- B. Kiểm tra xem TRONG KỲ DỰ THU NÀY (từ mốc Night Audit đến giờ) đã ghi nhận MILESTONE chưa?
        SELECT EXISTS (
            SELECT 1 FROM public.daily_expected_ledger 
            WHERE booking_id = v_booking.id 
              AND event_type = 'MILESTONE' 
              AND created_at >= v_threshold
        ) INTO v_already_synced;

        -- C. Điều kiện để cộng thêm 1 ngày tiền phòng:
        -- 1. Chưa được cộng trong kỳ này (v_already_synced = false)
        -- 2. Thời gian ở thực tế đã vượt qua mốc Night Audit đầu tiên (không tính ngày đầu check-in vì đã có CHECK_IN event)
        -- 3. Chỉ cộng khi thời gian hiện tại đã sang ngày tiếp theo so với lúc Check-in (xét theo mốc Night Audit)
        
        IF NOT v_already_synced AND now() >= v_threshold THEN
            -- Kiểm tra xem có thực sự đã bước sang ngày mới so với lúc Check-in chưa
            -- (Dựa trên mốc Night Audit của ngày Check-in)
            DECLARE
                v_checkin_threshold timestamptz;
                v_night_audit_time time;
            BEGIN
                -- Lấy giờ Night Audit của hotel
                SELECT COALESCE(night_audit_time, '04:00:00')::time INTO v_night_audit_time 
                FROM public.settings WHERE hotel_id = v_booking.hotel_id AND key = 'config' LIMIT 1;
                
                -- Mốc Night Audit của ngày Check-in
                v_checkin_threshold := ((v_booking.check_in_actual AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_night_audit_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';
                
                -- Nếu khách vào sau giờ Night Audit của ngày đó, thì mốc tính thêm ngày đầu tiên là Night Audit ngày hôm sau
                IF v_booking.check_in_actual >= v_checkin_threshold THEN
                    v_checkin_threshold := v_checkin_threshold + INTERVAL '1 day';
                END IF;

                -- Chỉ INSERT nếu hiện tại đã vượt qua mốc cần tính thêm ngày
                IF now() >= v_checkin_threshold AND v_price_daily > 0 THEN
                    INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
                    VALUES (v_booking.hotel_id, v_booking.id, v_price_daily, 'P.' || v_booking.room_number || ' Ở thêm 01 ngày (Tự động)', 'MILESTONE');
                END IF;
            END;
        END IF;
    END LOOP;
END;
$$;

-- 2. Cập nhật lại RPC lấy Dự thu để đảm bảo tính nhất quán
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
    v_threshold := public.fn_get_current_night_audit_threshold(v_hotel_id);

    -- Đồng bộ stay-over (Incremental)
    PERFORM public.fn_sync_stayover_milestones(v_hotel_id);
    
    -- Tổng hợp
    RETURN (
        SELECT COALESCE(SUM(amount), 0) 
        FROM public.daily_expected_ledger 
        WHERE hotel_id = v_hotel_id AND created_at >= v_threshold
    );
END;
$$;

-- 3. Thông báo hoàn tất
NOTIFY pgrst, 'reload schema';
