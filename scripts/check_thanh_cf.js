const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const bookingId = 'c2e40719-1009-4097-b95b-151ff4288c4a';
    const res = await client.query('SELECT * FROM public.cash_flow WHERE ref_id = $1', [bookingId]);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
