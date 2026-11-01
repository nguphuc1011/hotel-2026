const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'room_categories'");
  console.log('room_categories columns:', cols.rows);

  const sample = await client.query("SELECT id, hotel_id, name, price_hourly, price_daily, price_overnight FROM room_categories");
  console.table(sample.rows);

  await client.end();
}

run().catch(console.error);
