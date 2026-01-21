const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is missing in .env.local');
    process.exit(1);
  }

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Database.');

    const sqlPath = path.join(__dirname, '../db_scripts/fix_root_cause_schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying Root Cause Schema Fix...');
    await client.query(sqlContent);
    console.log('Successfully applied fix_root_cause_schema.sql');

  } catch (err) {
    console.error('Error applying script:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
