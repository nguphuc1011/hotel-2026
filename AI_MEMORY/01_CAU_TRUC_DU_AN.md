# 🗺️ CẤU TRÚC DỰ ÁN (01_CAU_TRUC_DU_AN.md)

## 1. Bản đồ Module & Route
- **Dashboard (Lễ tân)**: `src/app/page.tsx` - Sơ đồ phòng, quản lý booking nhanh.
- **Tài chính (Finance)**: `src/app/finance/page.tsx` - Dòng tiền, thu chi, bàn giao ca.
- **Khách hàng (CRM)**: `src/app/customers/page.tsx` - Danh sách, lịch sử, công nợ khách hàng.
- **Kho & Dịch vụ**: `src/app/settings/services/page.tsx` - Quản lý hàng hóa, định mức.
- **Cài đặt vận hành**: `src/app/settings/operations/page.tsx` - Cấu hình giá, giờ check-in/out.

## 2. Các Component Cốt lõi (Modals)
- `FolioModal.tsx`: Hiển thị hóa đơn tạm tính, cho phép thêm dịch vụ, gộp nợ. Có chốt chặn chống gian lận (is_printed).
- `CheckInModal.tsx`: Xử lý nhận phòng, tìm kiếm/tạo khách hàng, thu tiền cọc.
- `CheckOutModal.tsx`: Tính toán tiền cuối cùng, áp dụng giảm giá, phụ phí và in hóa đơn.
- `QuickSaleModal.tsx`: Bán hàng cho khách vãng lai không ở phòng.
- `PrintableInvoice.tsx` & `PrintableDebtReceipt.tsx`: Các component chuyên trách để in hóa đơn và phiếu thu nợ.

## 3. Hệ thống Logic & Service
- `src/lib/pricing.ts`: Chứa hàm `calculateRoomPrice` - Tính tiền dựa trên `RentalType` (Giờ/Ngày/Đêm).
- `src/services/hotel.ts`: `HotelService` - Chứa các hàm nghiệp vụ chính (`checkIn`, `checkOut`, `payDebt`). Tích hợp hệ thống "Mắt Thần" và **Hệ thống Sổ cái (Ledger)** để quản lý dòng tiền theo ca.
- `src/services/events.ts`: `EventService` - Ghi log các sự kiện quan trọng (Audit Trail).
- `src/types/index.ts`: Định nghĩa toàn bộ Interface (Room, Booking, Customer, PricingBreakdown).

## 4. Cấu trúc Database (Supabase)
- **Bảng chính**: `rooms`, `bookings`, `customers`, `services`.
- **Bảng tài chính**: `transactions`, `financial_transactions`, `cashflow_transactions`.
- **Hệ thống RPC**: `handle_check_in`, `handle_checkout` (Đảm bảo tính nguyên tử).
