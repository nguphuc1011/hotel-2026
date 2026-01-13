
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to database...');

    // Add floor column
    try {
        await client.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor text DEFAULT '1';");
        console.log("Added 'floor' column.");
    } catch (e) {
        console.log("Floor column might already exist or error: " + e.message);
    }

    // Add notes column
    try {
        await client.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS notes text;");
        console.log("Added 'notes' column.");
    } catch (e) {
        console.log("Notes column might already exist or error: " + e.message);
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
