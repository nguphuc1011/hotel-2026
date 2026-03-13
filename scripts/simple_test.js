const fs = require('fs');
fs.writeFileSync('C:\\1hotel2\\TEST_WRITE.txt', 'This is a test at ' + new Date().toISOString());
