const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!conn) {
  console.error('Missing DIRECT_URL or DATABASE_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const file = 'fix_cash_flow_updated_at.sql';
    const sqlPath = path.join(__dirname, '../db_scripts', file);
    
    if (!fs.existsSync(sqlPath)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(`--- Applying SQL from ${file} ---`);
    await client.query(sql);
    console.log(`Successfully applied ${file}.`);

    console.log('--- Reloading PostgREST schema cache ---');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Schema reload notified.');
    console.log('CASH_FLOW SCHEMA FIX DEPLOYED SUCCESSFULLY.');
  } catch (e) {
    console.error('Error applying SQL:', e.stack);
  } finally {
    await client.end();
  }
}

run();
