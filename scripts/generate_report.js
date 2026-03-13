const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    const res1 = await client.query("SELECT id, type, amount, description, created_at FROM public.customer_transactions ORDER BY created_at DESC LIMIT 5");
    const res2 = await client.query("SELECT id, category, amount, description, created_at FROM public.cash_flow ORDER BY created_at DESC LIMIT 5");
    const res3 = await client.query("SELECT id, deposit_amount, status FROM public.bookings WHERE deposit_amount > 0 ORDER BY updated_at DESC LIMIT 5");
    const res4 = await client.query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('bookings', 'cash_flow', 'customers', 'customer_transactions')");
    
    const rpcRes = await client.query(`
      SELECT proname, prosrc, pg_get_function_arguments(p.oid) as args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('adjust_customer_balance', 'calculate_booking_bill', 'process_checkout', 'check_in_customer')
    `);
    
    const data = {
      timestamp: new Date().toISOString(),
      customer_transactions: res1.rows,
      cash_flow: res2.rows,
      bookings_with_deposit: res3.rows,
      rls_status: res4.rows,
      rpc_definitions: rpcRes.rows
    };
    
    fs.writeFileSync('c:/1hotel2/scripts/REAL_DB_DETAIL.txt', JSON.stringify(data, null, 2));
    console.log('Report generated at c:/1hotel2/scripts/REAL_DB_DETAIL.txt');
  } catch (err) {
    fs.writeFileSync('c:/1hotel2/REPORT_ANALYSIS.json', JSON.stringify({ error: err.message, stack: err.stack }));
  } finally {
    await client.end();
  }
}
main();
