const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.join(__dirname, '..', '.env.local');
let DATABASE_URL;

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL=(.*)/);
  if (match) {
      DATABASE_URL = match[1].trim();
      DATABASE_URL = DATABASE_URL.replace(/^["']|["']$/g, '');
  } else {
      const match2 = envContent.match(/POSTGRES_URL=(.*)/);
      if (match2) DATABASE_URL = match2[1].trim().replace(/^["']|["']$/g, '');
  }
} catch (e) {
  console.error('Could not read .env.local');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runScript(filename) {
    const sqlPath = path.join(__dirname, filename);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(`Running ${filename}...`);
    await client.query(sql);
    console.log(`Success! ${filename} executed.`);
}

async function main() {
  try {
    await client.connect();
    console.log('Connected.');

    await runScript('update_adjust_customer_balance_v2.sql');
    await runScript('create_update_booking_details_rpc.sql');

  } catch (err) {
    console.error('Error executing SQL:', err);
  } finally {
    await client.end();
  }
}

main();
