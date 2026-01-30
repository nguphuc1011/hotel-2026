
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

async function applySql() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Đã kết nối Postgres.');

    const sqlPath = path.join(__dirname, '..', 'db_scripts', 'fix_security_rpcs_v4.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🚀 Đang thực thi fix_security_rpcs_v4.sql...');
    await client.query(sql);
    console.log('✅ Đã thực thi SQL thành công!');

    // Kiểm tra lại ngay lập tức
    const checkSql = `
      SELECT 
        p.proname as function_name,
        pg_get_function_arguments(p.oid) as arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND p.proname = 'fn_approve_request';
    `;
    const res = await client.query(checkSql);
    console.log('\n🔍 Chữ ký hàm hiện tại trong DB:');
    res.rows.forEach(row => {
      console.log(`Hàm: ${row.function_name}`);
      console.log(`Tham số: ${row.arguments}`);
    });

  } catch (err) {
    console.error('💥 Lỗi khi thực thi SQL:', err.message);
  } finally {
    await client.end();
  }
}

applySql();
