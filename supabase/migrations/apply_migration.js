const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: "postgresql://postgres:postgres@localhost:5432/postgres"
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database');
    
    const sqlPath = path.join(__dirname, '20260108_final_fix_checkout_and_pricing.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Executing migration...');
    await client.query(sql);
    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Error executing migration:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
