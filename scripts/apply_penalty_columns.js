
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = "postgresql://postgres.udakzychndpndkevktlf:OtFg7MFJFy5qd9lu@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function run() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    const sqlPath = path.join(__dirname, '../db_scripts/add_penalty_columns.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying SQL...');
    await client.query(sql);
    console.log('Successfully added penalty columns and updated cancel_booking function.');

  } catch (err) {
    console.error('Error applying SQL:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
