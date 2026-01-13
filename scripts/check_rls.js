
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    
    // Check RLS on services
    const res = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname = 'services';
    `);
    
    if (res.rows.length > 0) {
        console.log(`Table 'services' RLS enabled: ${res.rows[0].relrowsecurity}`);
    }

    // Check policies
    const policies = await client.query(`
      SELECT * FROM pg_policies WHERE tablename = 'services';
    `);
    
    console.log('Policies on services:');
    policies.rows.forEach(p => console.log(`- ${p.policyname} (${p.cmd}): ${p.roles}`));
    
    // Check if we can select
    try {
        const testSelect = await client.query('SELECT count(*) FROM services');
        console.log('Test SELECT count:', testSelect.rows[0].count);
    } catch (e) {
        console.log('Test SELECT failed:', e.message);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
