const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname IN (
      'trg_sync_service_to_cash_flow', 
      'trg_sync_booking_to_cash_flow',
      'fn_sync_wallets'
    )
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
