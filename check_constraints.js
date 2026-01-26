
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Checking Constraints on cash_flow ---');
    const res = await client.query(`
        SELECT conname, contype, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = 'cash_flow'::regclass
    `);
    
    res.rows.forEach(r => {
        console.log(`Constraint: ${r.conname} | Type: ${r.contype} | Def: ${r.def}`);
    });

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
