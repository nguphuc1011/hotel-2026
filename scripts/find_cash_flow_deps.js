const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function find() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT p.proname, pg_get_functiondef(p.oid) as def 
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'public' 
        AND pg_get_functiondef(p.oid) ~* 'INSERT INTO public.cash_flow'
    `);
    
    console.log(`Found ${res.rows.length} functions inserting into cash_flow:`);
    res.rows.forEach(r => {
      console.log(`- ${r.proname}`);
    });
    
    // Check for triggers too
    const triggers = await client.query(`
      SELECT tgname, relname as table_name, proname as function_name
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_proc p ON t.tgfoid = p.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND tgisinternal = false
    `);
    console.log('\nAll active triggers:');
    console.table(triggers.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

find();
