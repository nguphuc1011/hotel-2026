const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
let DATABASE_URL;

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL=(.*)/);
  if (match) {
      DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
  } else {
      const match2 = envContent.match(/POSTGRES_URL=(.*)/);
      if (match2) DATABASE_URL = match2[1].trim().replace(/^["']|["']$/g, '');
  }
} catch (e) {
  console.error('Error reading .env.local:', e);
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to database.');
    
    const sqlPath = path.join(__dirname, 'fix_cash_flow_column.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Executing SQL fix...');
    await client.query(sql);
    console.log('✅ Successfully added payment_method column to cash_flow table.');
    
  } catch (err) {
    console.error('❌ Error executing fix:', err);
  } finally {
    await client.end();
  }
}

main();