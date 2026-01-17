const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

async function run() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'bookings' 
      AND table_schema = 'public'
    `);
    console.log(res.rows.map(r => r.column_name).join(', '));
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
