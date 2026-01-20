
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function runSql() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const sqlPath = path.join(process.cwd(), 'src/lib/staff_security.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing SQL...');
    await client.query(sql);
    console.log('SQL executed successfully');

  } catch (err) {
    console.error('Error executing SQL:', err);
  } finally {
    await client.end();
  }
}

runSql();
