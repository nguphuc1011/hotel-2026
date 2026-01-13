const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const sqlPath = path.join(__dirname, '../src/lib/billing_engine.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying SQL from:', sqlPath);
    await client.query(sql);
    console.log('Successfully applied billing_engine.sql');

  } catch (err) {
    console.error('Error applying SQL:', err);
  } finally {
    await client.end();
  }
}

main();
