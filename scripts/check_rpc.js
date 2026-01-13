const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DIRECT_URL,
});

async function run() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name LIKE 'calculate_booking_bill%'
    `);
    console.log('Found routines:', res.rows.map(r => r.routine_name));
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();