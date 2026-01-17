
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const sqlFile = path.join(__dirname, '../src/lib/billing_engine.sql');
const billingEngineSql = fs.readFileSync(sqlFile, 'utf8');

const setupSql = `
-- 1. Thêm cột billing_audit_trail vào bảng bookings
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS billing_audit_trail jsonb;

-- 2. Đảm bảo bảng audit_logs tồn tại
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
    customer_id uuid,
    room_id uuid,
    staff_id uuid,
    type text DEFAULT 'billing_checkout',
    total_amount numeric,
    explanation jsonb,
    created_at timestamptz DEFAULT now()
);
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Đã kết nối DB. Bắt đầu triển khai Audit Trail V2...');
    
    console.log('1. Đang cập nhật Schema (bookings & audit_logs)...');
    await client.query(setupSql);
    
    console.log('2. Đang cập nhật Billing Engine Functions...');
    await client.query(billingEngineSql);
    
    console.log('✅ Triển khai thành công!');
    console.log('- Đã thêm cột billing_audit_trail vào bookings');
    console.log('- Đã cập nhật toàn bộ logic giải trình (text[]) cho Billing Engine');
    
  } catch (err) {
    console.error('❌ Lỗi triển khai:', err);
  } finally {
    await client.end();
  }
}

main();
