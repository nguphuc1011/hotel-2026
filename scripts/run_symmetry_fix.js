const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = fs.readFileSync('db_scripts/fix_cash_flow_categories_symmetry.sql', 'utf8');
  await client.query(sql);
  console.log('Successfully executed fix_cash_flow_categories_symmetry.sql');
  await client.end();
}

run().catch(console.error);
