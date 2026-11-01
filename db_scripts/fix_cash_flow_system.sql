-- ==============================================================================
-- FIX CASH FLOW SYSTEM & REVENUE LEDGER CONSISTENCY
-- 1. Xóa Trigger trùng lặp gây nhân đôi dự thu (tr_expected_revenue_bookings)
-- 2. Chuẩn hóa fn_sync_stayover_milestones với đúng timestamp ngày kế toán
-- 3. Làm sạch các bản ghi test bất thường trong daily_expected_ledger
-- 4. Đồng bộ chính xác số dư ví wallets khớp 100% với sổ quỹ cash_flow
-- ==============================================================================

-- 1. Xóa trigger cũ trùng lặp trên bảng bookings
DROP TRIGGER IF EXISTS tr_expected_revenue_bookings ON public.bookings;
DROP FUNCTION IF EXISTS public.trg_expected_revenue_bookings();

-- 2. Nâng cấp hàm fn_sync_stayover_milestones để ghi nhận đúng timestamp mốc thời gian
CREATE OR REPLACE FUNCTION public.fn_sync_stayover_milestones(p_hotel_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_booking RECORD;
    v_bill jsonb;
    v_expected_days int;
    v_recorded_days int;
    v_price_daily numeric;
    v_milestone_time timestamptz;
BEGIN
    -- Quét toàn bộ phòng đang ở (Trừ phòng giờ)
    FOR v_booking IN 
        SELECT b.id, r.room_number, b.hotel_id, b.custom_price,
               rc.price_daily as cat_price_daily, b.check_in_actual
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE b.status = 'checked_in' 
          AND b.rental_type != 'hourly' 
          AND b.hotel_id = p_hotel_id
    LOOP
        v_price_daily := COALESCE(v_booking.custom_price, v_booking.cat_price_daily, 0);
        IF v_price_daily <= 0 THEN CONTINUE; END IF;

        -- Hỏi Billing Engine xem tính đến hiện tại là bao nhiêu ngày tiền phòng
        v_bill := public.calculate_booking_bill(v_booking.id, now());
        v_expected_days := ROUND((v_bill->>'room_charge')::numeric / v_price_daily);

        -- Đếm số ngày đã ghi nhận trong Ledger (CHECK_IN + MILESTONE)
        SELECT COUNT(*)::int INTO v_recorded_days
        FROM public.daily_expected_ledger 
        WHERE booking_id = v_booking.id 
          AND event_type IN ('CHECK_IN', 'MILESTONE');

        -- ĐIỀU KIỆN CỘNG THÊM MILESTONE:
        -- Gán đúng timestamp milestone theo ngày kế toán phát sinh
        IF v_expected_days > v_recorded_days AND now() >= (v_booking.check_in_actual + interval '20 hours') THEN
            WHILE v_expected_days > v_recorded_days LOOP
                v_milestone_time := LEAST(now(), v_booking.check_in_actual + (v_recorded_days * interval '1 day'));
                INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type, created_at)
                VALUES (v_booking.hotel_id, v_booking.id, v_price_daily, 'P.' || v_booking.room_number || ' Ở thêm ngày (Tự động)', 'MILESTONE', v_milestone_time);
                v_recorded_days := v_recorded_days + 1;
            END LOOP;
        END IF;
    END LOOP;
END;
$function$;

-- 3. Làm sạch các bản ghi test bất thường hôm nay trong daily_expected_ledger của hotel default
-- Xóa các bản ghi checkout/milestone khổng lồ của 2 booking thử nghiệm từ 7 tháng trước
DELETE FROM public.daily_expected_ledger 
WHERE booking_id IN ('6e858893-e3aa-4c20-b401-f3a4d20b4a19', '5961b9c3-6e3b-440c-b412-82faf40436fa')
  AND created_at >= '2026-10-31 23:00:00+00';

-- Xóa các bản ghi trùng lặp do trigger cũ tạo ra hôm nay (mô tả dạng 'P.xxx Check in phòng NGÀY')
DELETE FROM public.daily_expected_ledger
WHERE hotel_id = '33e31139-346d-4332-8b0f-5316019cba8c'
  AND created_at >= '2026-10-31 23:00:00+00'
  AND description LIKE '%Check in phòng%';

-- Xóa các bản ghi stayover test rác phát sinh nhiều lần cùng 1 thời điểm
DELETE FROM public.daily_expected_ledger
WHERE hotel_id = 'f6020952-a268-4086-8f17-f65d27d5f042'
  AND event_type = 'MILESTONE'
  AND created_at >= '2026-11-01 12:00:00+00';

-- 4. Đồng bộ chính xác số dư vật lý bảng wallets khớp với sổ quỹ cash_flow
UPDATE public.wallets 
SET balance = 118780000, updated_at = now() 
WHERE id = 'CASH' AND hotel_id = '33e31139-346d-4332-8b0f-5316019cba8c';

UPDATE public.wallets 
SET balance = 1915000, updated_at = now() 
WHERE id = 'BANK' AND hotel_id = '33e31139-346d-4332-8b0f-5316019cba8c';

UPDATE public.wallets 
SET balance = 440000, updated_at = now() 
WHERE id = 'RECEIVABLE' AND hotel_id = '33e31139-346d-4332-8b0f-5316019cba8c';
