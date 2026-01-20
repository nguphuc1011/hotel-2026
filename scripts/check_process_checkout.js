const { Client } = require('pg');
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
    console.log('--- Checking process_checkout Definition ---');
    const res = await client.query("SELECT pg_get_functiondef('public.process_checkout'::regproc)");
    console.log(res.rows[0].pg_get_functiondef);
  } catch (e) {
    console.error('Error checking function def:', e.message);
  } finally {
    await client.end();
  }
}

run();
