const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const toInspect = [
    'update_settings',
    'update_system_settings',
    'get_settings',
    'get_room_categories',
    'update_room_category',
    'settle_debt',
    'fn_guard_cash_flow',
    'trg_update_wallets_dml',
    'fn_apply_wallet_logic',
    'debug_auth',
    'refresh_active_ledgers',
    'fn_refresh_expected_revenue',
    'get_financial_health_check',
    'fn_check_financial_health'
  ];

  const res = await client.query(`
    SELECT proname, pg_get_function_identity_arguments(oid) as sig, prosrc as body
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)
  `, [toInspect]);

  for (const r of res.rows) {
    console.log(`\n=== ${r.proname}(${r.sig}) ===`);
    console.log(r.body.slice(0, 300).replace(/\n/g, ' '));
  }

  await client.end();
}
run().catch(console.error);
