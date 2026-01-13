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

    // 1. Settings Table Schema (to see if it's wide or narrow)
    const settingsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'settings'
      ORDER BY column_name;
    `);
    console.log('\n--- SETTINGS TABLE COLUMNS ---');
    console.log(settingsRes.rows);

    // 2. Room Categories Boolean Columns
    const catsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'room_categories' AND data_type = 'boolean'
      ORDER BY column_name;
    `);
    console.log('\n--- ROOM_CATEGORIES BOOLEAN TOGGLES ---');
    console.log(catsRes.rows.map(r => r.column_name));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
})();
