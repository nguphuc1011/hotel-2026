const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!conn) {
  console.error('Missing DATABASE_URL or DIRECT_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: conn });
  
  try {
    await client.connect();
    console.log('Connected to database');

    const sqlPath = path.join(__dirname, '../db_scripts/migrate_security_full_v3.sql');
    console.log(`Reading SQL from: ${sqlPath}`);
    
    if (!fs.existsSync(sqlPath)) {
        throw new Error(`File not found: ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('--- Applying Security V3 Migration ---');
    // Execute the whole script. 
    // Note: Some drivers might have issues with multiple statements if not configured, 
    // but usually pg client handles it if it's just a query string.
    await client.query(sql);
    console.log('Successfully applied Security V3 Migration.');

    console.log('--- Reloading PostgREST schema cache ---');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Schema reload notified.');
    
  } catch (e) {
    console.error('Error applying SQL:', e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
