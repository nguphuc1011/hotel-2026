const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const sqlPath = path.join(__dirname, '../db_scripts/fix_external_payables_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('--- Applying Fix ---');
    await client.query(sql);
    console.log('Success.');
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
