const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const filePath = 'c:\\1hotel2\\src\\lib\\billing_engine.sql';

async function applySql() {
  console.log('Reading SQL file...');
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log('Connecting to database...');
  // Try DATABASE_URL or SUPABASE_DB_URL
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  
  if (!connectionString) {
    console.error('No connection string found in .env.local (DATABASE_URL)');
    process.exit(1);
  }

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false } // Supabase usually requires SSL
  });

  try {
    await client.connect();
    console.log('Connected. Executing SQL...');
    await client.query(sql);
    console.log('Successfully applied billing_engine.sql');
  } catch (err) {
    console.error('Error executing SQL:', err);
  } finally {
    await client.end();
  }
}

applySql();
