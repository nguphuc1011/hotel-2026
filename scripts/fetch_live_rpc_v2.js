const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    const funcs = ['adjust_customer_balance', 'calculate_booking_bill', 'process_checkout', 'check_in_customer'];
    
    for (const funcName of funcs) {
      const res = await client.query(`
        SELECT proname, prosrc, pg_get_function_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1
      `, [funcName]);
      
      console.log(`\n=== FUNCTION: ${funcName} ===`);
      if (res.rows.length > 0) {
        res.rows.forEach(row => {
          console.log(`ARGS: ${row.args}`);
          console.log(`SOURCE:\n${row.prosrc}\n`);
        });
      } else {
        console.log(`(NOT FOUND)`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
