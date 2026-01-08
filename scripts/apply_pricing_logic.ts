
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Cần Service Role để chạy SQL
const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('--- ĐANG ÁP DỤNG LOGIC TÍNH TIỀN MỚI LÊN DATABASE ---');
  
  const sqlPath = resolve(process.cwd(), 'supabase/migrations/20260108_fix_handle_checkout_final.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Vì Supabase JS SDK không hỗ trợ chạy SQL trực tiếp trừ khi dùng RPC đặc biệt
  // Ta sẽ dùng một "mẹo" là gọi RPC `exec_sql` nếu có, hoặc báo người dùng
  // Tuy nhiên, trong môi trường này, ta có thể thử dùng một RPC giả định hoặc 
  // thông báo rằng file đã sẵn sàng để copy-paste.
  
  // Thử nghiệm chạy qua một RPC nội bộ nếu dự án có hỗ trợ
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('Lỗi khi áp dụng SQL:', error.message);
    console.log('\n--- HƯỚNG DẪN ---');
    console.log('Vì lý do bảo mật, bạn hãy copy nội dung file sau và dán vào Supabase SQL Editor:');
    console.log(sqlPath);
  } else {
    console.log('✅ Đã áp dụng logic mới thành công!');
  }
}

applyMigration();
