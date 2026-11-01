const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'wallets'");
  console.log('wallets columns:', cols.rows.map(r => r.column_name));

  const allWallets = await client.query("SELECT * FROM wallets");
  console.table(allWallets.rows);

  // 7. fn_get_pnl_report check
  console.log('\n--- 7. TESTING fn_get_pnl_report ---');
  const defaultHotelId = '33e31139-346d-4332-8b0f-5316019cba8c';
  const ctHotelId = 'f6020952-a268-4086-8f17-f65d27d5f042';

  for (const hid of [defaultHotelId, ctHotelId]) {
    try {
      const pnl = await client.query(
        'SELECT * FROM fn_get_pnl_report($1, $2, $3)',
        [hid, '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z']
      );
      console.log(`PnL report for ${hid}:`, pnl.rows[0]);
    } catch (e) {
      console.error(`Error running fn_get_pnl_report for ${hid}:`, e.message);
    }
  }

  // Check definition of fn_get_pnl_report
  console.log('\n--- 8. DEFINITION OF fn_get_pnl_report ---');
  const pnlDef = await client.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    WHERE p.proname = 'fn_get_pnl_report'
  `);
  if (pnlDef.rows.length > 0) {
    console.log(pnlDef.rows[0].def);
  }

  await client.end();
}

run().catch(console.error);
