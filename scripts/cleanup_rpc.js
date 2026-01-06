
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Drop the obsolete handle_checkout function (6 args)
    // Note: We need to specify argument types to drop the correct overload
    const dropSql = `
      DROP FUNCTION IF EXISTS public.handle_checkout(uuid, text, text, numeric, numeric, numeric);
    `;
    
    await client.query(dropSql);
    console.log('Dropped obsolete handle_checkout function (6 args).');

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

runMigration();
