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
      SELECT c.id, c.full_name, c.phone, c.balance, c.hotel_id, h.name as hotel_name,
        (SELECT COUNT(*) FROM public.customer_transactions ct WHERE ct.customer_id = c.id) as tx_count,
        (SELECT COUNT(*) FROM public.bookings b WHERE b.customer_id = c.id) as booking_count
      FROM public.customers c
      JOIN public.hotels h ON c.hotel_id = h.id
      ORDER BY c.hotel_id, c.full_name
    `);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
