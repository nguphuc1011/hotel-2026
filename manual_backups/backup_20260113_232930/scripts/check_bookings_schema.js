
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // Check bookings table columns
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings';
    `);

    console.log('Columns in bookings table:');
    res.rows.forEach(row => {
      console.log(`- ${row.column_name} (${row.data_type})`);
    });

    // Check services table existence
    const resServices = await client.query(`
      SELECT to_regclass('public.services');
    `);
    console.log('Services table exists:', resServices.rows[0].to_regclass !== null);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
