const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  try {
    let output = '';

    // Tables
    const tableRes = await client.query(`
      SELECT t.table_name, c.column_name, c.data_type, c.column_default, c.is_nullable
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name, c.ordinal_position;
    `);

    output += '--- TABLES ---\n';
    let currentTable = '';
    tableRes.rows.forEach(row => {
      if (row.table_name !== currentTable) {
        currentTable = row.table_name;
        output += `\nTable: ${currentTable}\n`;
      }
      output += `  - ${row.column_name}: ${row.data_type} (${row.is_nullable})${row.column_default ? ' DEFAULT ' + row.column_default : ''}\n`;
    });

    // RPCs
    const funcRes = await client.query(`
      SELECT p.proname, pg_get_functiondef(p.oid) as def
      FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname NOT LIKE 'pg_%'
      ORDER BY p.proname;
    `);

    output += '\n\n--- RPCs ---\n';
    funcRes.rows.forEach(row => {
      output += `\n--- ${row.proname} ---\n${row.def};\n`;
    });

    fs.writeFileSync('REAL_DB_DETAIL_V2.txt', output);
  } catch (err) {
    fs.writeFileSync('db_error_v2.txt', err.message);
  } finally {
    await client.end();
  }
}
main();
