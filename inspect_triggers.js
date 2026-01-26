
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const sql = `
SELECT 
    t.event_object_table as table_name, 
    t.trigger_name, 
    p.proname as function_name,
    p.prosrc as function_source
FROM information_schema.triggers t
JOIN pg_proc p ON t.action_statement LIKE '%FUNCTION ' || p.proname || '(%' OR t.action_statement LIKE '%FUNCTION ' || p.proname
WHERE t.event_object_table IN ('audit_logs', 'cash_flow');
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('--- All Triggers on cash_flow and audit_logs ---');
    const res = await client.query(sql);
    res.rows.forEach(r => {
        console.log(`\nTable: ${r.table_name} | Trigger: ${r.trigger_name} | Function: ${r.function_name}`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
