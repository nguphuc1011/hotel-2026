const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function applySql() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  try {
    const sqlPath = path.join(__dirname, '../db_scripts/update_wallets_accrual_trigger.sql');
    console.log(`Reading SQL from: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('--- Applying SQL from update_wallets_accrual_trigger.sql ---');
    await client.query(sql);
    console.log('Successfully applied SQL changes.');

    console.log('--- Reloading PostgREST schema cache ---');
    await client.query('NOTIFY pgrst, \'reload schema\'');
    console.log('Schema reload notified.');
  } catch (err) {
    console.error('Error applying SQL:', err);
  } finally {
    await client.end();
  }
}

applySql();
