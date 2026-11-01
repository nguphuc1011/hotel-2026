const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const hotelIdDefault = '33e31139-346d-4332-8b0f-5316019cba8c';
    const hotelIdCT = 'f6020952-a268-4086-8f17-f65d27d5f042';

    console.log('--- 1. BANK TRANSACTIONS (DEFAULT HOTEL) ---');
    const bankRes = await client.query(`
      SELECT id, amount, flow_type, payment_method_code, category, description, created_at 
      FROM public.cash_flow 
      WHERE hotel_id = $1 AND lower(payment_method_code) = 'bank'
      ORDER BY created_at ASC
    `, [hotelIdDefault]);
    console.table(bankRes.rows);

    console.log('\n--- 2. TRANSACTIONS WITH AMOUNT <= 0 (DEFAULT HOTEL) ---');
    const zeroRes = await client.query(`
      SELECT id, amount, flow_type, payment_method_code, category, description, ref_id, created_at 
      FROM public.cash_flow 
      WHERE hotel_id = $1 AND (amount <= 0 OR amount IS NULL)
      ORDER BY created_at DESC
      LIMIT 15
    `, [hotelIdDefault]);
    console.table(zeroRes.rows);

    console.log('\n--- 3. CHECKIN RPC & CHECKOUT RPC DEFINITIONS ---');
    const rpcs = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
        AND routine_name IN ('check_in_customer', 'check_out_booking', 'calculate_booking_bill', 'fn_get_daily_expected_revenue', 'fn_get_money_page_stats')
    `);
    console.table(rpcs.rows);

    console.log('\n--- 4. TRIGGERS ON BOOKINGS & CASH_FLOW ---');
    const trigs = await client.query(`
      SELECT trigger_name, event_manipulation, event_object_table, action_statement 
      FROM information_schema.triggers 
      WHERE event_object_table IN ('bookings', 'cash_flow', 'wallets', 'daily_expected_ledger')
    `);
    console.table(trigs.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
