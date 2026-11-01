const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'fn_sync_booking_to_ledger'
  `);
  for (const row of res.rows) {
    console.log('========================================');
    console.log('FUNCTION: ' + row.proname);
    console.log('========================================');
    console.log(row.prosrc);
  }
  await client.end();
}
run().catch(console.error);
