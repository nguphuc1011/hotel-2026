const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT p.proname, pg_get_functiondef(p.oid) as def
      FROM pg_proc p WHERE p.proname IN ('fn_delete_cash_flow', 'fn_create_cash_flow', 'fn_update_cash_flow', 'fn_adjust_wallet_balance')
    `);
    res.rows.forEach(r => console.log(`\n--- ${r.proname} ---\n${r.def}\n`));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
