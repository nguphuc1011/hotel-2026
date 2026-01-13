
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function run() {
  if (!process.env.DATABASE_URL) {
      console.error('Missing DATABASE_URL in .env.local');
      process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const sqlPath = path.join(__dirname, '../src/lib/check_in_customer.sql');
    console.log(`Reading SQL from ${sqlPath}...`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying check_in_customer RPC...');
    await client.query(sql);

    console.log('RPC check_in_customer created/updated successfully.');
  } catch (err) {
      console.error('Error:', err);
  } finally {
      await client.end();
  }
}

run();
