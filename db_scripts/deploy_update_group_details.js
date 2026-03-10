
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase URL or Service Role Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function deploy() {
  const sqlPath = path.join(__dirname, 'update_get_group_details.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Deploying update_get_group_details.sql...');
  
  // Split into statements if needed, but this file is just one CREATE FUNCTION
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('Error deploying SQL:', error);
    // Fallback: Try running directly if exec_sql is not available or fails (though exec_sql is usually custom)
    // Since I don't have direct SQL access without a custom RPC, I must rely on exec_sql or similar.
    // Wait, do I have exec_sql? I haven't checked.
    // If not, I can use pg client if I have connection string.
  } else {
    console.log('Successfully deployed update_get_group_details.sql');
  }
}

// Alternative: Use PG Client
const { Client } = require('pg');

async function deployPg() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    try {
        await client.connect();
        const sqlPath = path.join(__dirname, 'update_get_group_details.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sql);
        console.log('Successfully deployed update_get_group_details.sql via PG');
    } catch (e) {
        console.error('PG Error:', e);
    } finally {
        await client.end();
    }
}

deployPg();
