const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!conn) {
  console.error('Missing DATABASE_URL or DIRECT_URL in .env.local');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const sqlPath = process.argv[2];
    if (!sqlPath) {
        throw new Error('Please provide SQL file path');
    }
    const fullPath = path.resolve(process.cwd(), sqlPath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath}`);
    }
    const sql = fs.readFileSync(fullPath, 'utf8');
    
    console.log(`--- Applying SQL from ${sqlPath} ---`);
    await client.query(sql);
    console.log('Successfully applied SQL changes.');

    console.log('--- Reloading PostgREST schema cache ---');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Schema reload notified.');
  } catch (e) {
    console.error('Error applying SQL:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
