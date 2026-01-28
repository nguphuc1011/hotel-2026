const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Hardcode connection string from .env.local (reusing from previous scripts)
const connectionString = "postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const client = new Client({
  connectionString: connectionString,
});

async function applyBillingEngine() {
  try {
    await client.connect();
    console.log('Connected to database...');

    const sqlPath = path.join(__dirname, '../src/lib/billing_engine.sql');
    console.log(`Reading SQL from ${sqlPath}...`);
    
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing SQL...');
    await client.query(sqlContent);

    console.log('Billing Engine updated successfully!');
  } catch (err) {
    console.error('Error applying billing engine:', err);
  } finally {
    await client.end();
  }
}

applyBillingEngine();
