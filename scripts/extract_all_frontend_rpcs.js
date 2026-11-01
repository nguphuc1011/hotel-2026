const fs = require('fs');
const path = require('path');

function scanDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath, fileList);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const codeFiles = scanDir(path.resolve(__dirname, '../src'));
const rpcCalls = new Set();
const rpcByFile = {};

const regex = /\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g;

for (const file of codeFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = regex.exec(content)) !== null) {
    const rpcName = match[1];
    rpcCalls.add(rpcName);
    if (!rpcByFile[rpcName]) rpcByFile[rpcName] = [];
    const rel = path.relative(path.resolve(__dirname, '..'), file);
    if (!rpcByFile[rpcName].includes(rel)) {
      rpcByFile[rpcName].push(rel);
    }
  }
}

console.log(`=== FOUND ${rpcCalls.size} DISTINCT RPCS CALLED IN FRONTEND ===`);
Array.from(rpcCalls).sort().forEach(r => {
  console.log(`- ${r} (in ${rpcByFile[r].length} files: ${rpcByFile[r].join(', ')})`);
});
