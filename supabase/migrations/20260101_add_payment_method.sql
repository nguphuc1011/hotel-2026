-- Thêm cột payment_method vào bảng bookings nếu chưa có
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='payment_method') THEN
        ALTER TABLE bookings ADD COLUMN payment_method TEXT;
    END IF;
END $$;
