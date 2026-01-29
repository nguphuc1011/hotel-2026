
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function inspectFunction() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT 
        p.proname as function_name, 
        pg_get_function_arguments(p.oid) as arguments
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'public' AND p.proname = 'process_checkout';
    `);
    console.log('Function Definition from DB:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

inspectFunction();
