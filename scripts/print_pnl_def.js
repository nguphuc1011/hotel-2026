const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const pnlDef = await client.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    WHERE p.proname = 'fn_get_pnl_report'
  `);
  console.log(pnlDef.rows[0].def.substring(0, 1500));
  await client.end();
}

run().catch(console.error);
