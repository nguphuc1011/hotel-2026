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
    const sqlPath = path.join(__dirname, 'db_scripts/add_night_audit_settings.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('--- Applying migration: add_night_audit_settings.sql ---');
    await client.query(sql);
    console.log('Successfully applied migration.');

    console.log('--- Reloading PostgREST schema cache ---');
    await client.query("NOTIFY pgrst, 'reload schema';");
  } catch (e) {
    console.error('Error applying migration:', e.message);
  } finally {
    await client.end();
  }
}

run();
