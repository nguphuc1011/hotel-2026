
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const sqlFile = path.join(__dirname, '../db_scripts/fix_immutable_trigger.sql');
const sqlContent = fs.readFileSync(sqlFile, 'utf8');

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Đã kết nối DB. Bắt đầu cập nhật Trigger Immutable...');
    
    await client.query(sqlContent);
    console.log('✅ Cập nhật thành công fn_prevent_modification');
    
  } catch (err) {
    console.error('❌ Lỗi triển khai:', err);
  } finally {
    await client.end();
  }
}

main();
