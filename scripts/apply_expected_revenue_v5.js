const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const sqlFile = path.join(__dirname, '..', 'db_scripts', 'fix_expected_revenue_v5.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

async function update() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected. Applying fix_expected_revenue_v5.sql...');
    await client.query(sql);
    console.log('Successfully updated Expected Revenue logic to V5 (Incremental).');
  } catch (err) {
    console.error('Error updating Expected Revenue logic:', err);
  } finally {
    await client.end();
  }
}

update();
