
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // Check customers columns
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'customers' 
      ORDER BY column_name
    `);
    console.log('Columns in customers:', res.rows.map(r => r.column_name));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
