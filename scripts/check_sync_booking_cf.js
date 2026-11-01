const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const trgDef = await client.query(`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname = 'trg_sync_booking_to_cash_flow'
  `);
  console.log(trgDef.rows[0].def);

  await client.end();
}

run().catch(console.error);
