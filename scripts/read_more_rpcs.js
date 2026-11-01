const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const rpcs = ['fn_sync_booking_to_ledger', 'fn_reverse_cash_flow_on_cancel'];
    for (const name of rpcs) {
      const res = await client.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = $1", [name]);
      if (res.rows.length > 0) {
        console.log(`\n--- ${name} ---\n`, res.rows[0].pg_get_functiondef);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

check();
