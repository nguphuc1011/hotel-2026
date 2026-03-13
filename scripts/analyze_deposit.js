const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    console.log('--- Checking Recent Deposits ---');
    
    // 1. Recent customer transactions
    const txRes = await client.query(`
      SELECT id, customer_id, type, amount, balance_before, balance_after, booking_id, hotel_id, created_at
      FROM public.customer_transactions
      WHERE type = 'deposit'
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log('Recent customer_transactions (type=deposit):');
    console.table(txRes.rows);

    // 2. Recent cash flows
    const cfRes = await client.query(`
      SELECT id, flow_type, category, amount, description, ref_id, hotel_id, created_at
      FROM public.cash_flow
      WHERE category = 'Tiền cọc'
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log('\nRecent cash_flow (category=Tiền cọc):');
    console.table(cfRes.rows);

    // 3. Check corresponding bookings
    if (txRes.rows.length > 0) {
      const bookingIds = txRes.rows.map(r => `'${r.booking_id}'`).join(',');
      const bkRes = await client.query(`
        SELECT id, deposit_amount, status, hotel_id
        FROM public.bookings
        WHERE id IN (${bookingIds})
      `);
      console.log('\nCorresponding Bookings:');
      console.table(bkRes.rows);
    }

    // 4. Check RLS status
    const rlsRes = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('bookings', 'cash_flow', 'customers', 'customer_transactions');
    `);
    console.log('\nRLS Status:');
    console.table(rlsRes.rows);

    // 5. Check if hotel_id is set in current session or if there are policies
    const policyRes = await client.query(`
      SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
      AND tablename IN ('bookings', 'cash_flow', 'customers', 'customer_transactions');
    `);
    console.log('\nRLS Policies:');
    console.table(policyRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
