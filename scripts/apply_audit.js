
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // 1. Apply Schema
    console.log('Applying Audit Schema...');
    const schemaSql = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'audit_schema.sql'), 'utf8');
    await client.query(schemaSql);
    console.log('Audit Schema applied.');

    // 2. Apply RPCs
    console.log('Applying Audit RPCs...');
    const rpcSql = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'audit_rpc.sql'), 'utf8');
    await client.query(rpcSql);
    console.log('Audit RPCs applied.');

  } catch (err) {
    console.error('Error applying audit changes:', err);
  } finally {
    await client.end();
  }
}

main();
