const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    console.log('--- CHECKING HOTEL ID FOR SLUG "ct" ---');
    const hotelRes = await client.query(`SELECT id, name, slug FROM hotels WHERE slug = 'ct'`);
    if (hotelRes.rows.length === 0) {
      console.log('Hotel "ct" not found');
      return;
    }
    const hotel = hotelRes.rows[0];
    console.log('Hotel found:', hotel);

    console.log('\n--- CHECKING ROOM 201 ---');
    const roomRes = await client.query(`
      SELECT r.id, r.room_number, r.status, r.current_booking_id 
      FROM rooms r 
      WHERE r.hotel_id = $1 AND r.room_number = '201'
    `, [hotel.id]);
    
    if (roomRes.rows.length === 0) {
      console.log('Room 201 not found');
      return;
    }
    const room = roomRes.rows[0];
    console.log('Room found:', room);

    if (room.current_booking_id) {
      console.log('\n--- CHECKING ACTIVE BOOKING ---');
      const bookingRes = await client.query(`
        SELECT b.id, b.check_in_actual, b.rental_type, b.status,
               public.calculate_booking_bill(b.id) as bill_from_rpc
        FROM bookings b 
        WHERE b.id = $1
      `, [room.current_booking_id]);
      console.log('Booking details:', JSON.stringify(bookingRes.rows[0], null, 2));
    } else {
      console.log('No active booking for Room 201');
    }

    console.log('\n--- CHECKING DASHBOARD RPC FOR THIS HOTEL ---');
    const dashboardRes = await client.query(`SELECT public.fn_get_dashboard_data($1) as dashboard_data`, [hotel.id]);
    const dashboardData = dashboardRes.rows[0].dashboard_data;
    
    const room201Data = dashboardData.rates?.find(r => r.booking_id === room.current_booking_id);
    console.log('Room 201 Dashboard Data:', JSON.stringify(room201Data, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
