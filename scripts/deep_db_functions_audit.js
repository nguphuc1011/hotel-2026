const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('=== AUDITING ALL DATABASE FUNCTIONS IN PUBLIC SCHEMA ===\n');

  // 1. Find all overloaded functions (same proname, multiple signatures)
  const overloads = await client.query(`
    SELECT proname, COUNT(*) as count, array_agg(pg_get_function_identity_arguments(oid)) as signatures
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    GROUP BY proname
    HAVING COUNT(*) > 1
    ORDER BY count DESC, proname
  `);
  console.log('1. OVERLOADED FUNCTIONS (Count > 1):');
  console.table(overloads.rows);

  // 2. List all functions with their return types, volatility, security definer
  const allFns = await client.query(`
    SELECT p.oid, p.proname, 
           pg_get_function_identity_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as return_type,
           p.prosecdef as is_security_definer,
           p.provolatile as volatility
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
    ORDER BY p.proname
  `);
  console.log(`\n2. TOTAL FUNCTIONS IN PUBLIC: ${allFns.rows.length}`);

  // 3. Check trigger functions
  const triggers = await client.query(`
    SELECT tgname, relname as table_name, proname as function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE c.relnamespace = 'public'::regnamespace
      AND NOT t.tgisinternal
    ORDER BY table_name, tgname
  `);
  console.log('\n3. ACTIVE USER TRIGGERS:');
  console.table(triggers.rows);

  // 4. Save list of all function names to cross-reference with codebase
  const fnNames = [...new Set(allFns.rows.map(r => r.proname))];
  
  await client.end();
  return { overloads: overloads.rows, allFns: allFns.rows, triggers: triggers.rows, fnNames };
}

run().catch(console.error);
