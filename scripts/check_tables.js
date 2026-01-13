
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkTables() {
  try {
    await client.connect();
    
    console.log('--- Transactions Table ---');
    const trans = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'transactions';
    `);
    console.log(trans.rows.map(r => r.column_name));

    console.log('--- Surcharge Rules Table ---');
    const rules = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'surcharge_rules';
    `);
    console.log(rules.rows.map(r => r.column_name));

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

checkTables();
