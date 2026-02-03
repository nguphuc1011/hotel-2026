const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const sqlPath = path.join(__dirname, '../db_scripts/update_finance_security_dynamic.sql');

async function applySql() {
  console.log(`Reading SQL from: ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('--- Applying Finance Security & Dynamic Policy ---');
    await client.query(sql);
    console.log('Successfully applied SQL changes.');
    
    // Reload PostgREST schema cache
    await client.query('NOTIFY pgrst, \'reload schema\'');
    console.log('Reloaded PostgREST schema.');
    
  } catch (err) {
    console.error('Error applying SQL:', err);
  } finally {
    await client.end();
  }
}

applySql();
