import { PERMISSION_KEYS } from '@/services/permissionService';

export const PERMISSION_METADATA = [
  {
    group: 'Trang Sổ Tiền (Money)',
    items: [
      { code: PERMISSION_KEYS.VIEW_MONEY, label: 'Truy cập trang Sổ Tiền' },
      { code: PERMISSION_KEYS.VIEW_MONEY_BALANCE_CASH, label: 'Xem số dư Tiền mặt (Két)' },
      { code: PERMISSION_KEYS.VIEW_MONEY_BALANCE_BANK, label: 'Xem số dư Ngân hàng' },
      { code: PERMISSION_KEYS.VIEW_MONEY_REVENUE, label: 'Xem Sổ Doanh thu' },
      { code: PERMISSION_KEYS.VIEW_MONEY_EXTRA_FUNDS, label: 'Xem Quỹ mở rộng (Tạm giữ, Công nợ...)' },
      { code: PERMISSION_KEYS.VIEW_MONEY_EXTRA_FUNDS_RECEIVABLE, label: 'Xem Công nợ khách hàng (Nếu ẩn Quỹ mở rộng)' },
      { code: PERMISSION_KEYS.CREATE_TRANSACTION, label: 'Tạo Phiếu Thu/Chi (Ngoài màn hình Sơ đồ phòng)' },
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
    group: 'Hệ thống',
    items: [
      { code: PERMISSION_KEYS.VIEW_SETTINGS, label: 'Truy cập Cài đặt' },
      { code: PERMISSION_KEYS.MANAGE_PERMISSIONS, label: 'Quản lý Phân quyền' },
    ]
  }
];
