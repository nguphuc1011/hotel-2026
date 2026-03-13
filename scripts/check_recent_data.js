const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    console.log('--- Checking Recent General Transactions ---');
    
    // 1. Any recent transactions?
    const txRes = await client.query(`
      SELECT id, type, amount, description, created_at
      FROM public.customer_transactions
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    console.log('Recent customer_transactions (all):');
    console.table(txRes.rows);

    // 2. Any recent cash flows?
    const cfRes = await client.query(`
      SELECT id, flow_type, category, amount, description, created_at
      FROM public.cash_flow
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    console.log('\nRecent cash_flow (all):');
    console.table(cfRes.rows);

    // 3. Bookings with any deposit_amount > 0?
    const bkRes = await client.query(`
      SELECT id, deposit_amount, status, created_at
      FROM public.bookings
      WHERE deposit_amount > 0
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    console.log('\nBookings with deposit_amount > 0:');
    console.table(bkRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
