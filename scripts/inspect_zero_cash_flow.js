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
      SELECT id, hotel_id, flow_type, category, amount, description, payment_method_code, ref_id, is_auto, created_at
      FROM public.cash_flow
      WHERE amount <= 0 OR amount IS NULL
      ORDER BY created_at DESC
    `);
    console.log(`Found ${res.rows.length} rows with amount <= 0:`);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
