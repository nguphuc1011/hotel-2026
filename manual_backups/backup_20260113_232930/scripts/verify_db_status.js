
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('--- Checking Bookings Table Columns ---');
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings'
      AND column_name IN ('discount_amount', 'custom_surcharge', 'services_used');
    `);
    
    if (res.rows.length === 3) {
      console.log('✅ All 3 new columns exist in bookings table.');
    } else {
      console.log('❌ Missing columns in bookings table. Found:', res.rows.map(r => r.column_name));
    }
    console.table(res.rows);

    console.log('\n--- Checking RPC Function ---');
    const rpcRes = await client.query(`
       SELECT routines.routine_name
       FROM information_schema.routines
       WHERE routines.routine_name = 'calculate_booking_bill_v2';
    `);
    if (rpcRes.rows.length > 0) {
        console.log('✅ RPC calculate_booking_bill_v2 exists.');
    } else {
        console.log('❌ RPC calculate_booking_bill_v2 DOES NOT exist.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
