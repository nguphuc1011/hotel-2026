
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Checking process_checkout Definition ---');
    const res = await client.query(`
        SELECT p.proname, p.prosecdef, r.rolname as owner
        FROM pg_proc p
        JOIN pg_roles r ON p.proowner = r.oid
        WHERE p.proname = 'process_checkout'
    `);
    
    if (res.rows.length === 0) {
        console.log('Function process_checkout NOT FOUND');
    } else {
        res.rows.forEach(r => {
            console.log(`Function: ${r.proname} | Security Definer: ${r.prosecdef} | Owner: ${r.owner}`);
        });
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
