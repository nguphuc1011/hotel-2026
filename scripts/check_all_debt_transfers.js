const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    console.log('--- ALL CASH FLOW WITH DEBT_TRANSFER ---');
    const res = await client.query(`
      SELECT cf.id, cf.hotel_id, cf.amount, cf.ref_id, cf.description, cf.created_at,
             b.customer_id, c.full_name as customer_name, c.balance as customer_balance
      FROM public.cash_flow cf
      JOIN public.bookings b ON cf.ref_id = b.id
      LEFT JOIN public.customers c ON b.customer_id = c.id
      WHERE cf.payment_method_code = 'debt_transfer' OR cf.category = 'Kết chuyển nợ'
      ORDER BY cf.created_at DESC
    `);
    console.table(res.rows);

    for (const r of res.rows) {
      const tx = await client.query('SELECT * FROM public.customer_transactions WHERE booking_id = $1', [r.ref_id]);
      console.log(`Booking ${r.ref_id} (${r.customer_name}): found ${tx.rows.length} rows in customer_transactions`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
