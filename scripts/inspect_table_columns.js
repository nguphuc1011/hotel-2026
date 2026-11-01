const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const table = process.argv[2] || 'settings';
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [table]);
  console.table(res.rows);

  // Also query first 2 rows of settings table
  const sample = await client.query(`SELECT * FROM public.${table} LIMIT 2`);
  console.log('Sample rows:');
  console.log(sample.rows);

  await client.end();
}
run().catch(console.error);
