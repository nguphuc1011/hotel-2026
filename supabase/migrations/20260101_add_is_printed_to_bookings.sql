-- Thêm cột is_printed để kiểm soát việc xóa dịch vụ sau khi in nháp
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT false;
