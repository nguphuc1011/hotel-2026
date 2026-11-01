const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log('--- 1. Tables ---');
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log(tables.rows.map(r => r.table_name).join(', '));

    console.log('\n--- 2. Payment Methods ---');
    try {
      const pm = await client.query("SELECT * FROM public.payment_methods");
      console.table(pm.rows);
    } catch(e) { console.log('Table payment_methods not found'); }

    console.log('\n--- 3. Shifts Schema ---');
    const shiftCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'shifts'");
    console.log(shiftCols.rows.map(r => r.column_name).join(', '));

    console.log('\n--- 4. Booking Services (Profit/COGS) ---');
    const serviceCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'booking_services'");
    console.log(serviceCols.rows.map(r => r.column_name).join(', '));

    console.log('\n--- 5. Booking Folio (Master/Group) ---');
    const bookingCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings'");
    console.log(bookingCols.rows.map(r => r.column_name).join(', '));

    console.log('\n--- 6. RPC: process_checkout Logic ---');
    const checkoutDef = await client.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'process_checkout'");
    if (checkoutDef.rows.length > 0) {
      // Look for master/group payment logic
      const def = checkoutDef.rows[0].pg_get_functiondef;
      console.log('Contains master_booking_id:', def.includes('master_booking_id'));
      console.log('Contains deposit_transfer:', def.includes('deposit_transfer'));
      console.log('Contains debt_transfer:', def.includes('debt_transfer'));
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

check();
