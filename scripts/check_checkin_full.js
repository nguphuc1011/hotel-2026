const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const checkinDef = await client.query(`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname = 'check_in_customer'
  `);
  console.log(checkinDef.rows[0].def);

  await client.end();
}

run().catch(console.error);
