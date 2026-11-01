const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id, booking_id, amount, description, event_type, created_at
      FROM public.daily_expected_ledger
      ORDER BY created_at DESC
      LIMIT 15
    `);
    console.log('Recent daily_expected_ledger entries:');
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
