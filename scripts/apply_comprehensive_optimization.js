const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const sqlPath = path.resolve(__dirname, '../db_scripts/comprehensive_system_optimization.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('Connecting to database...');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('Executing comprehensive system optimization SQL...');
  try {
    await client.query(sql);
    console.log('SUCCESS: All SQL statements executed successfully!');
  } catch (err) {
    console.error('ERROR executing SQL:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
