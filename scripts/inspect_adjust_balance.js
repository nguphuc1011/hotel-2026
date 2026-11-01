const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT pg_get_functiondef(oid) as def
      FROM pg_proc WHERE proname = 'adjust_customer_balance'
    `);
    console.log(res.rows[0]?.def);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
