
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- 1. Checking CASH_FLOW Schema ---');
    const resCF = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cash_flow'
    `);
    resCF.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));

    console.log('\n--- 2. Checking WALLETS Schema ---');
    const resWallets = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'wallets'
    `);
    resWallets.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));

    console.log('\n--- 3. Checking trg_update_wallets Definition ---');
    // Get the function name used by the trigger
    const resTrig = await client.query(`
        SELECT t.trigger_name, p.proname as function_name, p.prosrc as source
        FROM information_schema.triggers t
        JOIN pg_proc p ON t.action_statement LIKE '%FUNCTION ' || p.proname || '(%' OR t.action_statement LIKE '%FUNCTION ' || p.proname
        WHERE t.event_object_table = 'cash_flow' 
        AND t.trigger_name = 'tr_update_wallets'
    `);
    
    if (resTrig.rows.length > 0) {
        console.log(`Trigger Function: ${resTrig.rows[0].function_name}`);
        console.log('--- Source Code ---');
        console.log(resTrig.rows[0].source);
    } else {
        console.log('TRIGGER tr_update_wallets NOT FOUND on cash_flow!');
    }

    console.log('\n--- 4. Checking Last 5 Cash Flow Entries ---');
    const resData = await client.query(`
        SELECT id, flow_type, category, amount, payment_method_code, created_at, occurred_at 
        FROM cash_flow 
        ORDER BY occurred_at DESC 
        LIMIT 5
    `);
    console.table(resData.rows);

    console.log('\n--- 5. Checking Current Wallet Balances ---');
    const resBal = await client.query('SELECT * FROM wallets ORDER BY id');
    console.table(resBal.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
