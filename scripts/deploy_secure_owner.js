const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

// Use DIRECT_URL for direct connection if available, else DATABASE_URL
// Supabase often requires DIRECT_URL for schema changes if connection pooling is on port 6543
const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!conn) {
  console.error('Missing DIRECT_URL or DATABASE_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ 
    connectionString: conn,
    ssl: { rejectUnauthorized: false } // Needed for Supabase usually
  });
  
  try {
    await client.connect();
    
    const sqlPath = path.join(__dirname, '../db_scripts/secure_owner_actions.sql');
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
