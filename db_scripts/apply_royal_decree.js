
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = dotenv.config({ path: envPath });

if (envConfig.error) {
  console.error("Error loading .env.local:", envConfig.error);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Missing DATABASE_URL in .env.local");
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false } // Required for Supabase
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    const sqlPath = path.join(__dirname, 'royal_decree_enforcement.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Executing SQL...");
    await client.query(sql);
    console.log("Royal Decree SQL applied successfully!");

  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

run();
