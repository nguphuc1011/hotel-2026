const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    console.error('Error: DATABASE_URL not found in .env.local');
    console.log('Please add DATABASE_URL=postgres://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres to your .env.local file.');
    return;
  }

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    const sqlPath = path.join(__dirname, '../supabase/migrations/20260106_fix_db_logic_v2.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running migration (Fix Check-in & Checkout Double Counting)...');
    await client.query(sql);
    console.log('Migration completed successfully!');
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

runMigration();
