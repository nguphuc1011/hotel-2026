const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'customer_transactions'
  `);
  console.log('customer_transactions columns:', cols.rows.map(r => r.column_name));

  const sample = await client.query('SELECT * FROM customer_transactions LIMIT 5');
  console.log('Sample rows:', sample.rows);

  await client.end();
}

run().catch(console.error);
