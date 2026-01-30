const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function inspect() {
  try {
    await client.connect();
    console.log('Connected to DB');

    // Check cancel_booking RPC
    const res = await client.query(`
      SELECT routine_name, routine_definition, external_language
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name = 'cancel_booking';
    `);

    if (res.rows.length > 0) {
      console.log('Found cancel_booking RPC:');
      console.log(res.rows[0].routine_definition);
    } else {
      console.log('cancel_booking RPC NOT FOUND');
    }

    // Check bookings table columns
    const cols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bookings';
    `);
    console.log('Bookings table columns:', cols.rows.map(r => r.column_name).join(', '));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

inspect();
