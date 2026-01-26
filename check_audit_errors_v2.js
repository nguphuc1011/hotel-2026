
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Checking Audit Logs for Checkout Errors ---');
    const res = await client.query(`
        SELECT * FROM audit_logs 
        WHERE explanation::text LIKE '%Lỗi%' OR type = 'error'
        ORDER BY created_at DESC 
        LIMIT 5
    `);
    
    if (res.rows.length === 0) {
        console.log('No errors found in audit_logs.');
    } else {
        res.rows.forEach(r => {
            console.log(`[${r.created_at}] Staff: ${r.staff_id}`);
            console.log(`Error: ${JSON.stringify(r.explanation)}`);
        });
    }

    console.log('\n--- Checking fn_apply_wallet_logic Source ---');
    const resFunc = await client.query(`
        SELECT prosrc FROM pg_proc WHERE proname = 'fn_apply_wallet_logic'
    `);
    if (resFunc.rows.length > 0) {
        console.log(resFunc.rows[0].prosrc);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
