const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const sql = fs.readFileSync('db_scripts/fix_cash_flow_system.sql', 'utf8');
    console.log('Applying db_scripts/fix_cash_flow_system.sql...');
    await client.query(sql);
    console.log('✅ Successfully applied fixes!');
  } catch (err) {
    console.error('❌ Failed:', err);
  } finally {
    await client.end();
  }
}

main();
