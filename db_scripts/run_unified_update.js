const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
let DATABASE_URL;

try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DATABASE_URL=(.*)/);
    if (match) {
        DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
    } else {
        const match2 = envContent.match(/POSTGRES_URL=(.*)/);
        if (match2) DATABASE_URL = match2[1].trim().replace(/^["']|["']$/g, '');
    }
  } else {
      console.error('.env.local not found at', envPath);
      // Fallback for some setups
      DATABASE_URL = process.env.DATABASE_URL;
  }
} catch (e) {
  console.error('Error reading .env.local:', e);
  process.exit(1);
}

if (!DATABASE_URL) {
    console.error('DATABASE_URL not found!');
    process.exit(1);
}

const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        console.log('Connected to database');

        const sqlPath = path.join(__dirname, 'restore_logic_unified.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing SQL script...');
        await client.query(sql);
        console.log('SQL script executed successfully!');

    } catch (err) {
        console.error('Error executing script:', err);
    } finally {
        await client.end();
        console.log('Disconnected');
    }
}

run();
