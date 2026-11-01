-- Thêm các Index tối ưu hóa truy vấn Multi-Tenant cho toàn bộ Database
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_id ON public.rooms (hotel_id);
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_status ON public.rooms (hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_hotel_status ON public.bookings (hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_hotel_created ON public.bookings (hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_checkin_checkout ON public.bookings (hotel_id, check_in_actual, check_out_actual);
CREATE INDEX IF NOT EXISTS idx_customers_hotel_id ON public.customers (hotel_id);
CREATE INDEX IF NOT EXISTS idx_customers_hotel_phone ON public.customers (hotel_id, phone);
CREATE INDEX IF NOT EXISTS idx_cash_flow_hotel_occurred ON public.cash_flow (hotel_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_flow_hotel_type ON public.cash_flow (hotel_id, flow_type);
CREATE INDEX IF NOT EXISTS idx_room_categories_hotel_id ON public.room_categories (hotel_id);
CREATE INDEX IF NOT EXISTS idx_services_hotel_id ON public.services (hotel_id);
CREATE INDEX IF NOT EXISTS idx_shifts_hotel_status ON public.shifts (hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_trans_hotel_cust ON public.customer_transactions (hotel_id, customer_id);
