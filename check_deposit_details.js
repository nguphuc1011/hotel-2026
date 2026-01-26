
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    // Check cash_flow table definition
    console.log('--- Checking cash_flow table definition ---');
    const resTable = await client.query(`
        SELECT column_name, column_default 
        FROM information_schema.columns 
        WHERE table_name = 'cash_flow' AND column_name = 'payment_method_code'
    `);
    console.log(resTable.rows);

    // Check top of fn_apply_wallet_logic
    console.log('--- Checking top of fn_apply_wallet_logic ---');
    const resFunc = await client.query(`
        SELECT substring(prosrc from 1 for 1000) as src
        FROM pg_proc
        WHERE proname = 'fn_apply_wallet_logic'
    `);
    if (resFunc.rows.length > 0) {
        console.log(resFunc.rows[0].src);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
