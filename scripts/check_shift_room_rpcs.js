const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const rpcs = await client.query(`
    SELECT proname, pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname IN ('close_shift', 'change_room')
  `);
  for (const r of rpcs.rows) {
    console.log(`=== ${r.proname} ===`);
    console.log(r.def);
  }

  await client.end();
}

run().catch(console.error);
