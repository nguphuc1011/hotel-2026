
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    
    // Check services columns
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'services';
    `);
    
    console.log('Columns in services table:');
    res.rows.forEach(row => {
      console.log(`- ${row.column_name} (${row.data_type})`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
