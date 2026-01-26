
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    console.log('--- Checking RLS Policies on cash_flow ---');
    const res = await client.query(`
        SELECT policyname, cmd, roles, qual, with_check 
        FROM pg_policies 
        WHERE tablename = 'cash_flow'
    `);
    
    res.rows.forEach(r => {
        console.log(`Policy: ${r.policyname}`);
        console.log(`  Cmd: ${r.cmd}`);
        console.log(`  USING: ${r.qual}`);
        console.log(`  CHECK: ${r.with_check}`);
    });

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
