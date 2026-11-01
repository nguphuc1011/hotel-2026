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
      SELECT id, flow_type, category, amount, description, payment_method_code, ref_id, occurred_at
      FROM public.cash_flow
      WHERE hotel_id = 'f6020952-a268-4086-8f17-f65d27d5f042'
      ORDER BY occurred_at ASC
    `);
    console.log(`Found ${res.rows.length} transactions for Cát Tường:`);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
