
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const sql = `
-- 1. Cập nhật bảng settings
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS auto_overnight_switch boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_full_day_early boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_full_day_late boolean DEFAULT true;

-- 2. Tạo bảng audit_logs để lưu vết tính toán
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
    customer_id uuid,
    room_id uuid,
    staff_id uuid,
    type text DEFAULT 'billing_checkout',
    total_amount numeric,
    explanation jsonb, -- Lưu mảng giải trình
    created_at timestamptz DEFAULT now()
);

-- Index để truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_audit_logs_booking_id ON public.audit_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Đã kết nối DB. Bắt đầu triển khai DDL...');
    
    await client.query(sql);
    console.log('✅ Triển khai DDL thành công:');
    console.log('- Đã thêm các cột auto_... vào bảng settings');
    console.log('- Đã tạo bảng audit_logs');
    
  } catch (err) {
    console.error('❌ Lỗi triển khai DDL:', err);
  } finally {
    await client.end();
  }
}

main();
