const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    console.log('--- CHECKING fn_get_dashboard_data DEFINITION ---');
    const funcRes = await client.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'fn_get_dashboard_data'
    `);
    
    if (funcRes.rows.length > 0) {
      console.log('Function definition found:');
      console.log(funcRes.rows[0].definition);
    } else {
      console.log('Function fn_get_dashboard_data not found');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
main();
