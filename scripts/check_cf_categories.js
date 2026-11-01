const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const cfc = await client.query(`
    SELECT id, hotel_id, system_code, name, type, is_revenue
    FROM cash_flow_categories
    ORDER BY hotel_id, name
  `);
  console.table(cfc.rows);

  await client.end();
}

run().catch(console.error);
