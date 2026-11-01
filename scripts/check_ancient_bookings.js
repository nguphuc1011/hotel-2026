const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT b.id, r.room_number, b.rental_type, b.status, b.check_in_actual, b.check_out_actual, b.notes
      FROM public.bookings b
      JOIN public.rooms r ON b.room_id = r.id
      WHERE b.id IN ('6e858893-e3aa-4c20-b401-f3a4d20b4a19', '5961b9c3-6e3b-440c-b412-82faf40436fa')
    `);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
