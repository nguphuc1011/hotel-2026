const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// 1. Load config
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
const supabaseUrl = config.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = config.SUPABASE_SERVICE_ROLE_KEY;
const defaultManagerId = '25b0a204-064b-4281-89cf-ccfc95d9adf7'; // ntt (Admin)

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration in .env or .env.local');
  process.exit(1);
}

// 2. Init Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function startBot() {
  try {
    // 3. Fetch Telegram Token from Database
    console.log('🔄 Fetching Telegram Bot Token from Database...');
    const { data: settings, error } = await supabase
      .from('settings')
      .select('telegram_bot_token')
      .eq('key', 'config')
      .single();

    if (error || !settings?.telegram_bot_token) {
      console.error('❌ Telegram Bot Token not found in Database settings!');
      console.error('👉 Please configure it at: /settings/system');
      process.exit(1);
    }

    const token = settings.telegram_bot_token;
    console.log('✅ Found Telegram Token');

    // 4. Init Bot
    const bot = new TelegramBot(token, { polling: true });

    console.log('🚀 Local Telegram Bot is running (Polling Mode)...');
    console.log('🔗 Connected to Supabase:', supabaseUrl);

    // 5. Handle Callback Queries (Buttons)
    bot.on('callback_query', async (query) => {

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  const [action, requestId] = data.split('_');

  if (action === 'approve') {
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Approving request: ${requestId}`);
    try {
      // 1. Get a valid manager ID
      let approverId = defaultManagerId;
      const { data: adminUser } = await supabase
          .from('staff')
          .select('id')
          .in('role', ['Owner', 'Admin'])
          .eq('is_active', true)
          .limit(1)
          .single();
      
      if (adminUser) {
          approverId = adminUser.id;
      }

      // SỬA ĐỔI: Ép kiểu dữ liệu rõ ràng để khớp với Database
      const { data: result, error } = await supabase.rpc('fn_approve_request', {
        p_manager_id: String(approverId),
        p_manager_pin: null,
        p_method: 'TELEGRAM',
        p_request_id: String(requestId)
      });

      if (error) {
        console.error('RPC Error:', error);
        throw error;
      }

      if (result.success) {
        const managerName = result.approved_by_name || 'Quản lý';
        bot.answerCallbackQuery(query.id, { text: 'Đã phê duyệt thành công!' });
        bot.editMessageText(
          query.message.text + `\n\n✅ <b>ĐÃ PHÊ DUYỆT</b>\nBởi: ${managerName} (Local Dev)`,
          { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' }
        );
        console.log(`Successfully approved ${requestId} by ${managerName}`);
      } else {
        console.warn('Approval failed:', result.message);
        bot.answerCallbackQuery(query.id, { text: 'Lỗi: ' + result.message, show_alert: true });
      }
    } catch (err) {
      console.error('Error in approve action:', err);
      bot.answerCallbackQuery(query.id, { text: 'Lỗi hệ thống: ' + err.message, show_alert: true });
    }
  } 
  else if (action === 'reject') {
    console.log(`[${new Date().toLocaleTimeString()}] ❌ Rejecting request: ${requestId}`);
    try {
      const { error } = await supabase
        .from('pending_approvals')
        .update({ 
          status: 'REJECTED',
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      bot.answerCallbackQuery(query.id, { text: 'Đã từ chối.' });
      bot.editMessageText(
        query.message.text + '\n\n❌ <b>ĐÃ TỪ CHỐI</b>',
        { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('Error in reject action:', err);
      bot.answerCallbackQuery(query.id, { text: 'Lỗi: ' + err.message, show_alert: true });
    }
  }
});

    // Error handling
    bot.on('polling_error', (error) => {
      console.error('Polling Error:', error.code, error.message);
    });

  } catch (error) {
    console.error('Failed to start bot:', error);
  }
}

startBot();
