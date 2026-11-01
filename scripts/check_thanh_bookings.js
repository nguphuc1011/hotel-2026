const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const custId = 'a6f52cae-525c-4ba5-9860-dddd02f52908';
    const res = await client.query(`
      SELECT b.id, b.room_id, r.room_number, b.status, b.rental_type, b.check_in_actual, b.check_out_actual, b.deposit_amount, b.notes
      FROM public.bookings b
      JOIN public.rooms r ON b.room_id = r.id
      WHERE b.customer_id = $1
      ORDER BY b.created_at DESC
      LIMIT 10
    `, [custId]);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
