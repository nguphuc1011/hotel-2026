const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!conn) {
  console.error('Missing DATABASE_URL or DIRECT_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const sqlPath = path.join(__dirname, '../db_scripts/update_repay_debt_rpc_return.sql');
    console.log(`Reading SQL from: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('--- Applying SQL from update_repay_debt_rpc_return.sql ---');
    await client.query(sql);
    console.log('Successfully applied SQL changes.');

    console.log('--- Reloading PostgREST schema cache ---');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Schema reload notified.');
  } catch (e) {
    console.error('Error applying SQL:', e.message);
  } finally {
    await client.end();
  }
}

run();
