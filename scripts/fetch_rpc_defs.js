
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const fs = require('fs');

async function main() {
  await client.connect();
  try {
    const funcs = ['process_checkout', 'adjust_customer_balance', 'check_in_customer', 'fn_create_cash_flow'];
    let output = '';
    
    for (const f of funcs) {
        const res = await client.query(`
            SELECT pg_get_functiondef(oid) as def
            FROM pg_proc
            WHERE proname = $1
        `, [f]);
        
        if (res.rows.length > 0) {
            output += `\n--- ${f} ---\n`;
            output += res.rows[0].def + ';\n';
        } else {
            output += `\n--- ${f} NOT FOUND ---\n`;
        }
    }
    fs.writeFileSync('rpc_defs.sql', output);
    console.log('Saved to rpc_defs.sql');
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
