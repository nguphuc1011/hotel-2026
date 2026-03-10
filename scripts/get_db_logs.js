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
    
    console.log('--- Querying database logs ---');
    // Query for logs. In Supabase, logs are often accessible via the dashboard or specific views.
    // For direct database access, we might look for pg_logdir or similar settings.
    // However, for NOTICE messages from PL/pgSQL, they usually appear in the Supabase dashboard logs.
    // Let's try to query a system view that might contain recent log entries if available.
    // If not, the user would typically check the Supabase project dashboard.
    
    // This query might not return PL/pgSQL NOTICE messages directly,
    // but it's a starting point for general log info.
    const res = await client.query(`
      SELECT log_time, user_name, database_name, process_id, connection_from, session_id, session_line_num, command_tag, session_start_time, virtual_transaction_id, transaction_id, error_severity, sqlstate, message, detail, hint, internal_query, internal_query_pos, context, query, query_pos, location, application_name, backend_type
      FROM pg_catalog.pg_event_log
      ORDER BY log_time DESC
      LIMIT 50;
    `);
    
    if (res.rows.length > 0) {
      console.log('Recent database log entries:');
      res.rows.forEach(row => {
        console.log(`[${row.log_time}] [${row.error_severity}] ${row.message}`);
        if (row.detail) console.log(`  Detail: ${row.detail}`);
        if (row.hint) console.log(`  Hint: ${row.hint}`);
        if (row.query) console.log(`  Query: ${row.query}`);
      });
    } else {
      console.log('No recent database log entries found via pg_catalog.pg_event_log.');
      console.log('PL/pgSQL NOTICE messages are typically found in the Supabase project dashboard logs.');
    }
    
  } catch (e) {
    console.error('Error querying database logs:', e);
  } finally {
    await client.end();
  }
}

run();
