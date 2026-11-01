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
      SELECT id, status, rental_type, created_at, check_out_actual, notes
      FROM public.bookings
      WHERE id IN ('4076f5af-208f-439b-86d4-6d997dd78841', '388556a5-755a-4831-abe1-fe39c2cd3ae3', 'dc4d3dfc-4391-4810-b9a0-8a34d66a5dfe')
    `);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
