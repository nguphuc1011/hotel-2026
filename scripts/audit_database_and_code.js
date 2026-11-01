const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 1. Get all overloaded functions with signatures and definitions
  const overloadsRes = await client.query(`
    SELECT proname, COUNT(*) as count, 
           json_agg(json_build_object(
             'oid', oid,
             'signature', pg_get_function_identity_arguments(oid),
             'args_with_defaults', pg_get_function_arguments(oid),
             'return_type', pg_get_function_result(oid),
             'is_security_definer', prosecdef
           )) as overloads
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    GROUP BY proname
    HAVING COUNT(*) > 1
    ORDER BY count DESC, proname;
  `);

  // 2. Get all functions in public schema
  const allFnsRes = await client.query(`
    SELECT oid, proname,
           pg_get_function_identity_arguments(oid) as signature,
           pg_get_function_arguments(oid) as args_with_defaults,
           pg_get_function_result(oid) as return_type,
           prosecdef as is_security_definer,
           provolatile as volatility
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    ORDER BY proname;
  `);

  // 3. Get all triggers
  const triggersRes = await client.query(`
    SELECT tgname, relname as table_name, proname as function_name,
           pg_get_triggerdef(t.oid) as trigger_def
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE c.relnamespace = 'public'::regnamespace
      AND NOT t.tgisinternal
    ORDER BY table_name, tgname;
  `);

  await client.end();

  // Scan codebase in src/ to see which RPCs are referenced
  function scanDir(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath, fileList);
      } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const codeFiles = scanDir(path.resolve(__dirname, '../src'));
  const codeContents = codeFiles.map(f => ({ file: f, content: fs.readFileSync(f, 'utf-8') }));

  const fnUsage = {};
  for (const fn of allFnsRes.rows) {
    const name = fn.proname;
    // Look for .rpc('name' or .rpc("name" or `rpc('${name}'`
    const rpcRegex = new RegExp(`rpc\\(\\s*['"\`]${name}['"\`]`, 'g');
    // Also look for direct function call if SQL string
    const sqlRegex = new RegExp(`\\b${name}\\s*\\(`, 'g');
    
    let rpcMatches = 0;
    let sqlMatches = 0;
    const matchingFiles = [];

    for (const { file, content } of codeContents) {
      const hasRpc = rpcRegex.test(content);
      const hasSql = sqlRegex.test(content);
      if (hasRpc || hasSql) {
        matchingFiles.push({ file: path.relative(path.resolve(__dirname, '..'), file), hasRpc, hasSql });
        if (hasRpc) rpcMatches++;
        if (hasSql) sqlMatches++;
      }
    }

    // Is it used in a trigger?
    const usedInTriggers = triggersRes.rows.filter(t => t.function_name === name);

    fnUsage[name] = {
      name,
      signature: fn.signature,
      return_type: fn.return_type,
      is_security_definer: fn.is_security_definer,
      rpcCallsInSrc: rpcMatches,
      sqlCallsInSrc: sqlMatches,
      triggerCount: usedInTriggers.length,
      triggers: usedInTriggers.map(t => `${t.table_name}:${t.tgname}`),
      matchingFiles: matchingFiles.map(m => m.file)
    };
  }

  const result = {
    totalFunctions: allFnsRes.rows.length,
    overloads: overloadsRes.rows,
    triggers: triggersRes.rows,
    fnUsage
  };

  fs.writeFileSync('scripts/audit_result.json', JSON.stringify(result, null, 2), 'utf-8');
  console.log('Saved audit to scripts/audit_result.json');
  console.log(`Total functions: ${allFnsRes.rows.length}`);
  console.log(`Overloaded functions count: ${overloadsRes.rows.length}`);
  console.log(`Total active user triggers: ${triggersRes.rows.length}`);
}

run().catch(console.error);
