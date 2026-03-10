
const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function dumpSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to DB for dumping...');

    let schemaSQL = '-- 1Hotel2 Schema Dump\n\n';

    // 1. Dump Tables
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    for (const row of tablesRes.rows) {
      const tableName = row.table_name;
      console.log(`Dumping table: ${tableName}`);
      
      schemaSQL += `-- Table: ${tableName}\n`;
      schemaSQL += `CREATE TABLE IF NOT EXISTS public.${tableName} (\n`;
      
      const columnsRes = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [tableName]);
      
      const cols = [];
      for (const col of columnsRes.rows) {
        let colDef = `  ${col.column_name} ${col.data_type}`;
        if (col.character_maximum_length) {
          colDef += `(${col.character_maximum_length})`;
        }
        if (col.is_nullable === 'NO') {
          colDef += ' NOT NULL';
        }
        if (col.column_default) {
          colDef += ` DEFAULT ${col.column_default}`;
        }
        cols.push(colDef);
      }
      
      schemaSQL += cols.join(',\n');
      
      // Constraints (PK)
      // For simplicity, we skip complex FKs for now to avoid ordering issues, 
      // or we can add them at the end. 
      // Let's try to get PK at least.
      const pkRes = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
      `, [tableName]);
      
      if (pkRes.rows.length > 0) {
        schemaSQL += `,\n  PRIMARY KEY (${pkRes.rows.map(r => r.column_name).join(', ')})`;
      }

      schemaSQL += '\n);\n\n';
    }

    // 2. Dump Functions (RPCs)
    const funcsRes = await client.query(`
      SELECT pg_get_functiondef(f.oid) as func_def
      FROM pg_catalog.pg_proc f
      INNER JOIN pg_catalog.pg_namespace n ON (f.pronamespace = n.oid)
      WHERE n.nspname = 'public'
    `);

    for (const row of funcsRes.rows) {
      schemaSQL += `${row.func_def};\n\n`;
    }

    fs.writeFileSync('full_schema.sql', schemaSQL);
    console.log('Schema dumped to full_schema.sql');

  } catch (err) {
    console.error('Error dumping schema:', err);
  } finally {
    await client.end();
  }
}

dumpSchema();
