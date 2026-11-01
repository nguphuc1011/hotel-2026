const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    console.log('--- 1. ACTIVE BOOKINGS IN CÁT TƯỜNG (CT) ---');
    const ctBookings = await client.query(`
      SELECT b.id, r.room_number, b.rental_type, b.status, b.check_in_actual, b.created_at, b.deposit_amount, b.custom_price
      FROM public.bookings b
      JOIN public.rooms r ON b.room_id = r.id
      WHERE b.hotel_id = 'f6020952-a268-4086-8f17-f65d27d5f042' AND b.status = 'checked_in'
    `);
    console.table(ctBookings.rows);

    console.log('\n--- 2. ACTIVE BOOKINGS IN DEFAULT HOTEL ---');
    const defBookings = await client.query(`
      SELECT b.id, r.room_number, b.rental_type, b.status, b.check_in_actual, b.created_at, b.deposit_amount, b.custom_price
      FROM public.bookings b
      JOIN public.rooms r ON b.room_id = r.id
      WHERE b.hotel_id = '33e31139-346d-4332-8b0f-5316019cba8c' AND b.status = 'checked_in'
    `);
    console.table(defBookings.rows);

    console.log('\n--- 3. CHECK DUPLICATE TRIGGERS ON BOOKINGS ---');
    const trigs = await client.query(`
      SELECT trigger_name, action_statement 
      FROM information_schema.triggers 
      WHERE event_object_table = 'bookings'
    `);
    console.table(trigs.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
