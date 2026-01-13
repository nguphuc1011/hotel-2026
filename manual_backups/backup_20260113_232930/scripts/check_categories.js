const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DIRECT_URL,
});

async function run() {
  await client.connect();
  try {
    const res = await client.query(`SELECT id, name, prices FROM room_categories`);
    console.log('Categories:', JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();