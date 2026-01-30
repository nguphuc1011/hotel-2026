
try {
  // Tìm và tiêu diệt các process node đang chạy script telegram_bot
  const { execSync } = require('child_process');
  console.log('🔄 Đang kiểm tra các tiến trình bot đang chạy...');
  
  // Lệnh Windows để tìm và kill process dựa trên dòng lệnh
  // wmic process where "commandline like '%telegram_bot%'" get processid
  // Hoặc đơn giản là taskkill /F /IM node.exe nếu người dùng chấp nhận tắt hết node
  
  // Cách an toàn hơn: dùng tasklist và lọc
  const output = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV').toString();
  console.log('Tiến trình node đang chạy:\n', output);
  
  console.log('👉 Nếu bạn bị lỗi 409 Conflict, hãy chạy lệnh sau trong PowerShell:');
  console.log('Stop-Process -Name node -Force');
  console.log('\nSau đó chạy lại: npm run telegram');
} catch (e) {
  console.log('Không thể kiểm tra tiến trình.');
}
