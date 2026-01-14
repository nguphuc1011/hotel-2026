const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function fixStatuses() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Database.');

    // 1. Fix Room Statuses
    // Valid statuses: 'available', 'occupied', 'dirty', 'repair'
    console.log('Aligning room statuses...');
    const resRooms = await client.query(`
      UPDATE public.rooms 
      SET status = CASE 
        WHEN status IN ('available', 'dirty', 'repair', 'occupied') THEN status
        WHEN status = 'active' THEN 'occupied'
        WHEN status = 'booked' THEN 'occupied'
        ELSE 'available'
      END
    `);
    console.log(`Updated ${resRooms.rowCount} rooms.`);

    // 2. Fix Booking Statuses
    // Valid statuses: 'pending', 'checked_in', 'checked_out', 'cancelled'
    console.log('Aligning booking statuses...');
    const resBookings = await client.query(`
      UPDATE public.bookings 
      SET status = CASE 
        WHEN status IN ('pending', 'checked_in', 'checked_out', 'cancelled') THEN status
        WHEN status = 'active' THEN 'checked_in'
        WHEN status = 'confirmed' THEN 'pending'
        WHEN status = 'completed' THEN 'checked_out'
        ELSE 'pending'
      END
      WHERE status NOT IN ('pending', 'checked_in', 'checked_out', 'cancelled')
    `);
    console.log(`Updated ${resBookings.rowCount} bookings.`);

    // 3. Ensure occupied rooms have a current_booking_id
    console.log('Syncing current_booking_id for occupied rooms...');
    await client.query(`
      UPDATE public.rooms r
      SET current_booking_id = (
        SELECT id FROM public.bookings b 
        WHERE b.room_id = r.id AND b.status = 'checked_in'
        ORDER BY b.check_in_actual DESC LIMIT 1
      )
      WHERE r.status = 'occupied' AND r.current_booking_id IS NULL
    `);

    console.log('Done.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

fixStatuses();
