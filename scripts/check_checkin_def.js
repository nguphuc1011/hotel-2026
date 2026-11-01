const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const checkinDef = await client.query(`
    SELECT proname, pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname IN ('check_in', 'check_in_booking', 'check_in_customer')
  `);
  for (const row of checkinDef.rows) {
    console.log(`=== ${row.proname} ===`);
    console.log(row.def.substring(0, 1000));
  }

  await client.end();
}

run().catch(console.error);
