
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('Resetting dirty rooms to available...');
    await client.query("UPDATE rooms SET status = 'available' WHERE status = 'dirty'");
    console.log('Done.');
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
