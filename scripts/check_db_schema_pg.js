
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Supabase Connection String usually looks like: postgres://postgres.[PROJECT_ID]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
// We can construct it from env if we have the right variables, but usually it's in SUPABASE_DB_URL
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('❌ Thiếu biến môi trường DATABASE_URL hoặc SUPABASE_DB_URL');
  console.log('Cố gắng thử dùng các biến khác...');
}

async function checkSchema() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Đã kết nối Postgres trực tiếp.');

    const sql = `
      SELECT 
        p.proname as function_name,
        pg_get_function_arguments(p.oid) as arguments,
        t.typname as return_type
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_type t ON p.prorettype = t.oid
      WHERE n.nspname = 'public'
      AND p.proname IN ('fn_approve_request', 'fn_create_approval_request', 'fn_resolve_policy')
      ORDER BY p.proname, p.oid;
    `;

    const res = await client.query(sql);
    console.log('\n--- KẾT QUẢ KIỂM TRA SCHEMA TRONG DB ---');
    if (res.rows.length === 0) {
      console.log('❌ Không tìm thấy hàm nào trong danh sách!');
    } else {
      res.rows.forEach(row => {
        console.log(`Hàm: ${row.function_name}`);
        console.log(`Tham số: ${row.arguments}`);
        console.log(`Kiểu trả về: ${row.return_type}`);
        console.log('-----------------------------------');
      });
    }

  } catch (err) {
    console.error('💥 Lỗi:', err.message);
  } finally {
    await client.end();
  }
}

checkSchema();
