const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('Connected to DB');

    // Check Bookings columns
    const bookingsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings'
      ORDER BY column_name;
    `);
    console.log('\n--- BOOKINGS TABLE ---');
    console.log(bookingsRes.rows.map(r => `${r.column_name} (${r.data_type})`));

    console.log('\n--- SETTINGS TABLE ---');
    const settingsRes = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'settings'
        ORDER BY column_name;
    `);
    console.log(settingsRes.rows.map(r => `${r.column_name} (${r.data_type})`));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
})();
