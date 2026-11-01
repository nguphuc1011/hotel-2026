const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const sqlFile = path.join(__dirname, '..', 'db_scripts', 'unify_financial_system.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

async function update() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected. Applying unify_financial_system.sql...');
    await client.query(sql);
    console.log('Successfully unified Financial Wallets and Trigger Logic.');
  } catch (err) {
    console.error('Error unifying Financial System:', err);
  } finally {
    await client.end();
  }
}

update();
