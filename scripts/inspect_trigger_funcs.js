const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname IN (
      'trg_expected_revenue_services', 
      'trg_expected_revenue_services_engine',
      'trg_expected_revenue_bookings_engine',
      'tr_handle_service_inventory',
      'handle_service_inventory'
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
