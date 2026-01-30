const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '../.env');
const envLocalFile = path.join(__dirname, '../.env.local');

let config = {};
if (fs.existsSync(envFile)) {
  const envConfig = dotenv.parse(fs.readFileSync(envFile));
  config = { ...config, ...envConfig };
}
if (fs.existsSync(envLocalFile)) {
  const envLocalConfig = dotenv.parse(fs.readFileSync(envLocalFile));
  config = { ...config, ...envLocalConfig };
}

const token = config.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('❌ Không tìm thấy Token trong .env');
  process.exit(1);
}

const bot = new TelegramBot(token);

async function resetBot() {
  try {
    console.log('🔄 Đang xóa Webhook...');
    await bot.deleteWebHook();
    console.log('✅ Đã xóa Webhook thành công.');
    
    console.log('🔄 Đang kiểm tra trạng thái Bot...');
    const me = await bot.getMe();
    console.log(`✅ Bot @${me.username} đã sẵn sàng cho Polling.`);
    
    console.log('\n👉 BÂY GIỜ BẠN CÓ THỂ CHẠY: npm run telegram');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    process.exit(1);
  }
}

resetBot();
