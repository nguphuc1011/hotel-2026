-- CLEANUP REDUNDANT RPCs
-- Xóa các hàm RPC dư thừa hoặc không còn sử dụng

DROP FUNCTION IF EXISTS public.get_booking_bill_for_frontend(uuid);
DROP FUNCTION IF EXISTS public.get_dashboard_room_rates();
