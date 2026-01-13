const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DIRECT_URL,
});

async function run() {
  await client.connect();
  try {
    const resC = await client.query(`SELECT count(*) FROM customers`);
    console.log('Customers:', resC.rows[0].count);
    
    const resR = await client.query(`SELECT count(*) FROM rooms`);
    console.log('Rooms:', resR.rows[0].count);
    
    const resCat = await client.query(`SELECT count(*) FROM room_categories`);
    console.log('Categories:', resCat.rows[0].count);
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();