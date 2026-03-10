
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Load environment variables
const envPath = path.join(__dirname, '../.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

// Database connection string
const dbUrl = envConfig.DATABASE_URL || envConfig.POSTGRES_URL;

if (!dbUrl) {
  console.error('DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false } // Required for Supabase
});

async function applySql() {
  try {
    await client.connect();
    console.log('Connected to database.');

    const sqlPath = path.join(__dirname, '../db_scripts/royal_decree_enforcement.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing Royal Decree SQL...');
    await client.query(sql);
    
    // Notify PostgREST to reload schema
    await client.query("NOTIFY pgrst, 'reload schema';");
    
    console.log('Royal Decree enforced successfully.');
  } catch (err) {
    console.error('Error executing SQL:', err);
  } finally {
    await client.end();
  }
}

applySql();
