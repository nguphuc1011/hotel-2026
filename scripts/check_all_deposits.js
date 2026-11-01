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
      SELECT 
        b.id, b.hotel_id, b.deposit_amount,
        COALESCE(SUM(cf.amount), 0) as cf_deposit,
        array_agg(cf.category) as categories
      FROM public.bookings b
      LEFT JOIN public.cash_flow cf ON b.id = cf.ref_id AND cf.category IN ('Tiền cọc', 'Thu trước') AND cf.flow_type = 'IN'
      WHERE b.deposit_amount > 0
      GROUP BY b.id, b.hotel_id, b.deposit_amount
      HAVING b.deposit_amount != COALESCE(SUM(cf.amount), 0)
    `);
    console.log(`Mismatch count with ('Tiền cọc', 'Thu trước'): ${res.rows.length}`);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
