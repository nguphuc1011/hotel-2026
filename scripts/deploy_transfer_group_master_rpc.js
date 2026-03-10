const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ 
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false } // Required for Supabase
  });
  
  try {
    await client.connect();
    
    const sqlPath = path.join(__dirname, '../db_scripts/create_transfer_group_master_rpc.sql');
    if (!fs.existsSync(sqlPath)) {
        throw new Error(`File not found: ${sqlPath}`);
    }
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log(`--- Applying SQL from ${sqlPath} ---`);
    await client.query(sql);
    console.log('Successfully applied SQL changes.');

    console.log('--- Reloading PostgREST schema cache ---');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Schema reload notified.');
    
  } catch (e) {
    console.error('Error applying SQL:', e);
  } finally {
    await client.end();
  }
}

run();
