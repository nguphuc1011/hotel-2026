
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!conn) {
    console.error('No connection string found in .env.local');
    process.exit(1);
}

async function run() {
    const client = new Client({ connectionString: conn });
    try {
        await client.connect();
        console.log('Connected to database.');
        
        const fileName = process.argv[2] || 'migrate_security_policy_v1.sql';
        const sqlPath = path.join(__dirname, '../db_scripts', fileName);
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('Executing migration...');
        await client.query(sql);
        console.log('Migration completed successfully.');
        
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
