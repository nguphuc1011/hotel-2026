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

    const res = await client.query(`
        SELECT * FROM settings 
    `);
    console.log('All Settings Rows:', res.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
})();
