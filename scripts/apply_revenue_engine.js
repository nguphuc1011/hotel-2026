const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const sqlFile = path.join(__dirname, '..', 'db_scripts', 'expected_revenue_engine.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

async function update() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected. Applying expected_revenue_engine.sql...');
    await client.query(sql);
    console.log('Successfully applied Consolidated Expected Revenue Engine.');
  } catch (err) {
    console.error('Error applying Expected Revenue Engine:', err);
  } finally {
    await client.end();
  }
}

update();
