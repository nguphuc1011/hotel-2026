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
const filesWithContent = codeFiles.map(f => ({
  path: f,
  rel: path.relative(path.resolve(__dirname, '..'), f),
  content: fs.readFileSync(f, 'utf-8')
}));

const namesToCheck = [
  'close_shift', 'open_shift', 'debug_auth', 'fn_apply_wallet_logic',
  'fn_approve_request', 'fn_approve_request_override', 'fn_auto_assign_shift_id',
  'fn_can_access_tenant', 'fn_change_own_pin', 'fn_check_approval_status',
  'fn_check_financial_health', 'fn_create_approval_request', 'fn_get_my_hotel_id',
  'fn_get_security_context', 'fn_get_security_context_v2', 'fn_get_system_setting',
  'fn_get_user_floors', 'fn_guard_cash_flow', 'fn_has_permission',
  'fn_refresh_expected_revenue', 'fn_staff_override_login', 'fn_update_security_setting',
  'force_staff_logout', 'get_financial_health_check', 'get_my_shift',
  'get_room_categories', 'get_settings', 'refresh_active_ledgers',
  'resolve_shift_variance', 'settle_debt', 'trg_update_wallets_dml',
  'update_room_category', 'update_settings', 'update_system_settings'
];

console.log('=== CHECKING USAGES IN SRC ===');
for (const name of namesToCheck) {
  const matches = [];
  for (const f of filesWithContent) {
    if (f.content.includes(name)) {
      matches.push(f.rel);
    }
  }
  if (matches.length > 0) {
    console.log(`[FOUND] ${name}: in ${matches.length} files -> ${matches.slice(0, 3).join(', ')}`);
  } else {
    console.log(`[NOT IN SRC] ${name}`);
  }
}
