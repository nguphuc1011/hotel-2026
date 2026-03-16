import { PERMISSION_KEYS } from '@/services/permissionService';

export const PERMISSION_METADATA = [
  {
    group: 'Trang Sổ Tiền (Money)',
    items: [
      { code: PERMISSION_KEYS.VIEW_MONEY, label: 'Truy cập trang Sổ Tiền' },
      { code: PERMISSION_KEYS.VIEW_MONEY_BALANCE_CASH, label: 'Xem số dư Tiền mặt (Két)' },
      { code: PERMISSION_KEYS.VIEW_MONEY_BALANCE_BANK, label: 'Xem số dư Ngân hàng' },
      { code: PERMISSION_KEYS.VIEW_MONEY_REVENUE, label: 'Xem Sổ Doanh thu (Quỹ tổng hợp)' },
      { code: PERMISSION_KEYS.VIEW_MONEY_DEBT_LIST, label: 'Xem Danh sách Khách nợ' },
      { code: PERMISSION_KEYS.VIEW_MONEY_TRANSACTION_HISTORY, label: 'Xem Lịch sử Giao dịch' },
      { code: PERMISSION_KEYS.FINANCE_ADJUST_WALLET, label: 'Điều chỉnh số dư quỹ' },
      { code: PERMISSION_KEYS.CREATE_TRANSACTION, label: 'Tạo Phiếu Thu/Chi (Ngoài màn hình Sơ đồ phòng)' },
    ]
  },
  {
    group: 'Khách hàng',
    items: [
      { code: PERMISSION_KEYS.VIEW_CUSTOMERS, label: 'Truy cập trang Khách hàng' },
    ]
  },
  {
    group: 'Tổng quan (Dashboard) & Báo cáo',
    items: [
      { code: PERMISSION_KEYS.VIEW_DASHBOARD, label: 'Truy cập Dashboard' },
      { code: PERMISSION_KEYS.VIEW_REPORTS, label: 'Xem Báo cáo' },
    ]
  },
  {
    group: 'Hệ thống & Cài đặt',
    items: [
      { code: PERMISSION_KEYS.VIEW_SETTINGS, label: 'Truy cập trang Cài đặt' },
      { code: PERMISSION_KEYS.VIEW_SETTINGS_GENERAL, label: 'Cấu hình chung (Khách sạn)' },
      { code: PERMISSION_KEYS.VIEW_SETTINGS_PRICING, label: 'Cấu hình giá & Phụ thu' },
      { code: PERMISSION_KEYS.VIEW_SETTINGS_CATEGORIES, label: 'Hạng phòng & Sơ đồ' },
      { code: PERMISSION_KEYS.VIEW_SETTINGS_SERVICES, label: 'Dịch vụ & Menu' },
      { code: PERMISSION_KEYS.VIEW_SETTINGS_CASH_FLOW, label: 'Danh mục Thu Chi' },
      { code: PERMISSION_KEYS.VIEW_SETTINGS_SYSTEM, label: 'Tham số hệ thống' },
      { code: PERMISSION_KEYS.MANAGE_PERMISSIONS, label: 'Quản lý Nhân viên & Phân quyền' },
      { code: PERMISSION_KEYS.VIEW_SAAS_ADMIN, label: 'Truy cập Quản trị SaaS (Cho Sale/Admin tổng)' },
    ]
  }
];
