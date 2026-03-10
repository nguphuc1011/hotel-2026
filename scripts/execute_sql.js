const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/execute_sql.js <sql_file_path>');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Nếu truyền đường dẫn tương đối, nó sẽ tính từ thư mục gốc dự án
    const sqlPath = path.isAbsolute(args[0]) ? args[0] : path.join(process.cwd(), args[0]);
    
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`SQL file not found: ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing SQL from:', sqlPath);
    await client.query(sql);
    console.log('SQL executed successfully');
  } catch (err) {
    console.error('Error executing SQL:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
