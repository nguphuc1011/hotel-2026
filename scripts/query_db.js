const https = require('https');
const fs = require('fs');

const sqlArg = process.argv[2];
let sql = '';
if (fs.existsSync(sqlArg)) {
  sql = fs.readFileSync(sqlArg, 'utf8');
} else {
  sql = sqlArg;
}

const token = process.env.SUPA_TOKEN;
if (!token) {
  console.error("SUPA_TOKEN not set");
  process.exit(1);
}

const postData = JSON.stringify({ query: sql });

const req = https.request({
  hostname: 'api.supabase.com',
  path: '/v1/projects/udakzychndpndkevktlf/database/query',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Response:', data);
    }
  });
});

req.on('error', (e) => console.error(e));
req.write(postData);
req.end();
