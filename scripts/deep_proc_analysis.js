const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const fns = await client.query(`
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) as signature,
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as return_type,
           p.prosecdef as is_security_definer,
           p.prosrc as body
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
    ORDER BY p.proname;
  `);

  const triggers = await client.query(`
    SELECT tgname, relname as table_name, proname as function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE c.relnamespace = 'public'::regnamespace
      AND NOT t.tgisinternal;
  `);

  await client.end();

  const auditData = JSON.parse(fs.readFileSync('scripts/audit_result.json', 'utf-8'));
  const fnUsage = auditData.fnUsage;

  // Check which functions are called from inside other procedures body
  const internalCalls = {};
  for (const fn of fns.rows) {
    internalCalls[fn.proname] = [];
  }

  for (const caller of fns.rows) {
    for (const target of fns.rows) {
      if (caller.proname !== target.proname) {
        const regex = new RegExp(`\\b${target.proname}\\s*\\(`, 'g');
        if (regex.test(caller.body)) {
          if (!internalCalls[target.proname].includes(caller.proname)) {
            internalCalls[target.proname].push(caller.proname);
          }
        }
      }
    }
  }

  const analysis = fns.rows.map(fn => {
    const usage = fnUsage[fn.proname] || {};
    const calledByProcs = internalCalls[fn.proname] || [];
    const triggerNames = (triggers.rows.filter(t => t.function_name === fn.proname)).map(t => `${t.table_name}:${t.tgname}`);
    const isOverloaded = auditData.overloads.some(o => o.proname === fn.proname);
    const rpcCalls = usage.rpcCallsInSrc || 0;
    const sqlCalls = usage.sqlCallsInSrc || 0;

    let category = 'ACTIVE';
    if (rpcCalls > 0) {
      category = 'CLIENT_RPC';
    } else if (triggerNames.length > 0) {
      category = 'TRIGGER_FUNCTION';
    } else if (calledByProcs.length > 0) {
      category = 'INTERNAL_STORED_PROC';
    } else {
      category = 'POTENTIALLY_DEAD';
    }

    return {
      oid: fn.oid,
      proname: fn.proname,
      signature: fn.signature,
      args: fn.args,
      return_type: fn.return_type,
      category,
      isOverloaded,
      rpcCalls,
      sqlCalls,
      triggerNames,
      calledByProcs,
      matchingFiles: usage.matchingFiles || []
    };
  });

  fs.writeFileSync('scripts/comprehensive_function_analysis.json', JSON.stringify(analysis, null, 2), 'utf-8');

  // Print summary stats
  const catCounts = {};
  analysis.forEach(a => {
    catCounts[a.category] = (catCounts[a.category] || 0) + 1;
  });
  console.log('Category Counts:', catCounts);

  const potentiallyDead = analysis.filter(a => a.category === 'POTENTIALLY_DEAD');
  console.log(`\nPotentially Dead Functions (${potentiallyDead.length}):`);
  potentiallyDead.forEach(p => console.log(`  - ${p.proname}(${p.signature})`));

}

run().catch(console.error);
