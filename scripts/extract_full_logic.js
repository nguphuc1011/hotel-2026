const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const functions = [
      'fn_get_daily_expected_revenue',
      'fn_get_current_night_audit_threshold',
      'fn_get_recorded_expected_revenue',
      'trg_expected_revenue_bookings_v2',
      'trg_expected_revenue_milestones_v2',
      'trg_expected_revenue_services_v2'
    ];

    console.log('--- EXTRACTING DATABASE LOGIC ---');
    for (const fn of functions) {
      const res = await client.query(`SELECT pg_get_functiondef('public.${fn}'::regproc);`);
      console.log(`\n--- [${fn}] ---`);
      console.log(res.rows[0].pg_get_functiondef);
    }

    console.log('\n--- CHECKING TRIGGER ATTACHMENTS ---');
    const triggersRes = await client.query(`
      SELECT event_object_table, trigger_name, action_statement
      FROM information_schema.triggers 
      WHERE trigger_name LIKE 'trg_expected_revenue_%'
      ORDER BY event_object_table;
    `);
    console.table(triggersRes.rows);

  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.end();
  }
}

run();
