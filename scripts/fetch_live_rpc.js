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
    const funcs = ['adjust_customer_balance', 'calculate_booking_bill', 'process_checkout', 'check_in_customer'];
    let output = '';
    
    for (const funcName of funcs) {
      const res = await client.query(`
        SELECT proname, prosrc, pg_get_function_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1
      `, [funcName]);
      
      if (res.rows.length > 0) {
        output += `--- FUNCTION: ${funcName} ---\n`;
        res.rows.forEach(row => {
          output += `ARGS: ${row.args}\n`;
          output += `SOURCE:\n${row.prosrc}\n\n`;
        });
      } else {
        output += `--- FUNCTION: ${funcName} (NOT FOUND) ---\n\n`;
      }
    }
    
    fs.writeFileSync('c:/1hotel2/LIVE_RPC_DEFINITIONS.txt', output);
    console.log('RPC definitions saved to LIVE_RPC_DEFINITIONS.txt');
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
