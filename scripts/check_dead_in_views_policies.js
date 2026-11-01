const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const deadNames = [
    'debug_auth', 'fn_apply_wallet_logic', 'fn_approve_request', 'fn_approve_request_override',
    'fn_auto_assign_shift_id', 'fn_can_access_tenant', 'fn_change_own_pin', 'fn_check_approval_status',
    'fn_check_financial_health', 'fn_create_approval_request', 'fn_get_my_hotel_id',
    'fn_get_security_context', 'fn_get_security_context_v2', 'fn_get_system_setting',
    'fn_get_user_floors', 'fn_guard_cash_flow', 'fn_has_permission', 'fn_refresh_expected_revenue',
    'fn_staff_override_login', 'fn_update_security_setting', 'force_staff_logout',
    'get_financial_health_check', 'get_my_shift', 'get_room_categories', 'get_settings',
    'refresh_active_ledgers', 'resolve_shift_variance', 'settle_debt', 'trg_update_wallets_dml',
    'update_room_category', 'update_settings', 'update_system_settings'
  ];

  // Check if referenced in views
  const views = await client.query(`
    SELECT table_name, view_definition
    FROM information_schema.views
    WHERE table_schema = 'public';
  `);

  console.log(`Checking ${deadNames.length} functions against ${views.rows.length} views...`);
  for (const name of deadNames) {
    const inViews = views.rows.filter(v => v.view_definition && v.view_definition.includes(name));
    if (inViews.length > 0) {
      console.log(`[VIEW] ${name} used in view: ${inViews.map(v => v.table_name).join(', ')}`);
    }
  }

  // Also check RLS policies
  const policies = await client.query(`
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public';
  `);
  console.log(`Checking against ${policies.rows.length} RLS policies...`);
  for (const name of deadNames) {
    const inPolicies = policies.rows.filter(p => 
      (p.qual && p.qual.includes(name)) || 
      (p.with_check && p.with_check.includes(name))
    );
    if (inPolicies.length > 0) {
      console.log(`[RLS POLICY] ${name} used in policy: ${inPolicies.map(p => `${p.tablename}:${p.policyname}`).join(', ')}`);
    }
  }

  await client.end();
}
run().catch(console.error);
