const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const custId = 'a6f52cae-525c-4ba5-9860-dddd02f52908';
    
    console.log('--- 1. CUSTOMER ROW ---');
    const cust = await client.query('SELECT * FROM public.customers WHERE id = $1', [custId]);
    console.table(cust.rows);

    console.log('\n--- 2. CUSTOMER TRANSACTIONS ---');
    const txs = await client.query('SELECT * FROM public.customer_transactions WHERE customer_id = $1 ORDER BY created_at ASC', [custId]);
    console.table(txs.rows);

    console.log('\n--- 3. BOOKINGS FOR THIS CUSTOMER ---');
    const bookings = await client.query('SELECT * FROM public.bookings WHERE customer_id = $1 ORDER BY created_at ASC', [custId]);
    console.table(bookings.rows);

    console.log('\n--- 4. CASH FLOW FOR THIS CUSTOMER OR BOOKINGS ---');
    const cf = await client.query('SELECT * FROM public.cash_flow WHERE customer_id = $1 OR ref_id = ANY($2::uuid[])', [
      custId,
      bookings.rows.map(b => b.id)
    ]);
    console.table(cf.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
