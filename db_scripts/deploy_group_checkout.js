
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const sqlPath = path.join(__dirname, 'unify_process_checkout.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Running unify_process_checkout.sql...');
    await client.query(sql);
    console.log('Success!');
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
