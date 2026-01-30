
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function applySql(filePath) {
  try {
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    console.log(`Applying SQL from ${filePath}...`);
    
    // Split by simple function block or statement if needed, 
    // but usually rpc call with raw sql is not directly supported via client.rpc unless we have a specific 'exec_sql' function.
    // However, since we are in a dev environment, let's assume we might need to use the 'pg' library if available, 
    // or if we have an 'exec_sql' RPC. 
    // Checking previous context, it seems I used 'db_scripts' but didn't actually run them via node.
    // I will try to check if 'exec_sql' exists or use a direct connection string if available in env.
    
    // Let's look for a direct connection string in .env.local
    // If not found, I might have to rely on the user to run it or use a workaround.
    // Wait, the previous turn created the file but didn't run it.
    
    // Let's try to see if we can use the supabase-js to run raw sql? No, not by default.
    // I'll check if there is a 'pg' library installed or a connection string.
    
    if (process.env.POSTGRES_URL || process.env.DATABASE_URL) {
        const { Client } = require('pg');
        const client = new Client({
            connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        });
        await client.connect();
        await client.query(sqlContent);
        await client.end();
        console.log('Successfully applied SQL.');
    } else {
        console.error('No POSTGRES_URL or DATABASE_URL found in .env.local. Cannot apply SQL directly.');
        // Fallback: try to verify if the function exists via RPC
    }
  } catch (err) {
    console.error('Error applying SQL:', err);
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Please provide a file path');
  process.exit(1);
}

applySql(filePath);
