const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const migrationPath = 'c:/1hotel2/src/lib/migrations/20260313_fix_duration_text_rpc.sql';
  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found at ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  await client.connect();
  console.log('Connected to database.');
  
  try {
    console.log('Applying thorough financial migration...');
    // We execute the SQL string as a single query block
    // node-postgres can handle multiple statements if they are separated by semicolons
    await client.query(sql);
    console.log('Migration applied successfully!');
  } catch (err) {
    console.error('Migration failed:');
    console.error(err.message);
    if (err.position) {
      console.error(`Error position: ${err.position}`);
    }
  } finally {
    await client.end();
  }
}

main();
