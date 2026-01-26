
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Inspecting Full Logic ---');
    const res = await client.query(`
        SELECT proname, prosrc
        FROM pg_proc
        WHERE proname IN ('check_in_customer', 'fn_sync_booking_to_ledger', 'fn_apply_wallet_logic')
    `);
    
    res.rows.forEach(r => {
        console.log(`\n>>>>>>>>>>>>>>>> Function: ${r.proname} <<<<<<<<<<<<<<<<`);
        console.log(r.prosrc);
        console.log('------------------------------------------------------------');
    });

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
