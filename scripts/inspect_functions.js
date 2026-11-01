const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const funcs = [
      'fn_sync_stayover_milestones',
      'fn_get_current_night_audit_threshold',
      'process_checkout',
      'fn_sync_booking_to_ledger',
      'trg_expected_revenue_bookings',
      'trg_expected_revenue_bookings_engine',
      'trg_sync_booking_to_cash_flow',
      'fn_sync_wallets',
      'calculate_booking_bill',
      'check_in_customer',
      'fn_get_daily_expected_revenue',
      'fn_get_money_page_stats'
    ];

    let content = '';
    for (const name of funcs) {
      const res = await client.query(`
        SELECT p.proname, pg_get_functiondef(p.oid) as def
        FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = $1
      `, [name]);
      if (res.rows.length === 0) {
        content += `\n\n-- FUNCTION NOT FOUND: ${name}\n`;
      } else {
        res.rows.forEach(r => {
          content += `\n\n-- ==================== ${r.proname} ====================\n${r.def};\n`;
        });
      }
    }

    fs.writeFileSync('CRITICAL_FINANCIAL_FUNCTIONS.sql', content);
    console.log('Saved to CRITICAL_FINANCIAL_FUNCTIONS.sql, length:', content.length);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
