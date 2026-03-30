const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- FETCHING fn_get_daily_expected_revenue DEFINITION ---');
    const res = await client.query("SELECT pg_get_functiondef('public.fn_get_daily_expected_revenue'::regproc);");
    console.log(res.rows[0].pg_get_functiondef);

    console.log('\n--- FETCHING fn_get_current_night_audit_threshold DEFINITION ---');
    const resThreshold = await client.query("SELECT pg_get_functiondef('public.fn_get_current_night_audit_threshold'::regproc);");
    console.log(resThreshold.rows[0].pg_get_functiondef);

    console.log('\n--- CHECKING TRIGGERS ON bookings, cash_flow, booking_services ---');
    const triggersRes = await client.query(`
      SELECT event_object_table, trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_name LIKE 'trg_expected_revenue_%';
    `);
    console.table(triggersRes.rows);

    for (const row of triggersRes.rows) {
        const triggerDef = await client.query(`
            SELECT pg_get_functiondef(p.oid)
            FROM pg_trigger t
            JOIN pg_proc p ON t.tgfoid = p.oid
            WHERE t.tgname = '${row.trigger_name}';
        `);
        console.log(`\n--- DEFINITION FOR TRIGGER FUNCTION OF ${row.trigger_name} ---`);
        console.log(triggerDef.rows[0]?.pg_get_functiondef || 'Not found');
    }

  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.end();
  }
}

run();
