
const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const sql = fs.readFileSync('c:\\1hotel2\\db_scripts\\fix_checkout_deposit_transfer.sql', 'utf8');
    console.log('--- Executing fix_checkout_deposit_transfer.sql ---');
    await client.query(sql);
    console.log('Success!');
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
