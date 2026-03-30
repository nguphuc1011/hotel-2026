const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const bookingId = 'bb26c11b-7a93-4c29-b0bc-0a05b211b3ef';
    console.log('--- Checking Booking ee383766 ---');
    const res = await client.query('SELECT id, check_in_actual, status, hotel_id, rental_type FROM bookings WHERE id = $1', [bookingId]);
    console.log(res.rows[0]);

    console.log('\n--- Checking Cash Flow for this booking ---');
    const cf = await client.query('SELECT * FROM cash_flow WHERE ref_id = $1 ORDER BY occurred_at ASC', [bookingId]);
    console.log(cf.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
