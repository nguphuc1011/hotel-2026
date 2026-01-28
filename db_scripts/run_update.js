const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = "postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    const sqlPath = path.join(__dirname, 'update_category_revenue_logic.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Running SQL from ' + sqlPath);
    await client.query(sql);
    console.log('Success! Database updated.');
  } catch (err) {
    console.error('Error executing SQL:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
