const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DIRECT_URL,
});

async function run() {
  await client.connect();
  try {
    // Get a booking
    const res = await client.query(`SELECT id, room_id, customer_id FROM bookings LIMIT 1`);
    if (res.rows.length === 0) {
      console.log('No bookings found to test.');
      return;
    }
    
    const bookingId = res.rows[0].id;
    console.log('Testing with Booking ID:', bookingId);
    
    // Call RPC
    const rpcRes = await client.query(`SELECT calculate_booking_bill_v2($1) as result`, [bookingId]);
    
    console.log('Result:', JSON.stringify(rpcRes.rows[0].result, null, 2));
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();