const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const sampleThanhToan = await client.query(`
    SELECT id, hotel_id, flow_type, category, amount, description, ref_id, occurred_at
    FROM cash_flow
    WHERE category = 'Thanh toán'
    ORDER BY occurred_at DESC
    LIMIT 10
  `);
  console.log('Sample "Thanh toán" in cash_flow:');
  console.table(sampleThanhToan.rows);

  await client.end();
}

run().catch(console.error);
