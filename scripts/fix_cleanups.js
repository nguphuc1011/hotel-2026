const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query("UPDATE room_categories SET name = TRIM(name)");
  console.log('Trimmed room_categories names.');

  const res = await client.query("SELECT id, hotel_id, name FROM room_categories");
  console.table(res.rows);

  await client.end();
}

run().catch(console.error);
