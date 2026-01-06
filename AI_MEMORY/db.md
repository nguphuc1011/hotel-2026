# Cấu trúc Database Supabase - Hotel App

Tài liệu này liệt kê toàn bộ các bảng, cột, kiểu dữ liệu và ràng buộc trong cơ sở dữ liệu Supabase của dự án Hotel App.

---

## 1. Các Bảng (Tables)

### audit_logs
Bảng lưu vết các hoạt động thay đổi dữ liệu để phục vụ kiểm soát (audit).

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| user_id | uuid | YES | | |
| action | text | NO | | |
| entity_id | text | YES | | |
| old_value | jsonb | YES | | |
| new_value | jsonb | YES | | |
| reason | text | YES | | |
| ip_address | text | YES | | |
| suspicion_score | double precision | YES | 0 | |
| created_at | timestamp | YES | now() | |
| entity_type | text | YES | | |
| table_name | text | YES | | |
| severity | text | YES | 'info' | |
| action_type | text | YES | | |
| performed_by | uuid | YES | | |
| permission_used | text | YES | | |
| record_id | text | YES | | |
| old_data | jsonb | YES | | |
| new_data | jsonb | YES | | |

### bookings
Bảng lưu thông tin các đơn đặt phòng.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | uuid_generate_v4() | Primary Key |
| room_id | uuid | YES | | Foreign Key -> rooms(id) |
| customer_id | uuid | YES | | Foreign Key -> customers(id) |
| check_in_at | timestamp | YES | now() | |
| check_out_at | timestamp | YES | | |
| rental_type | text | YES | | |
| initial_price | numeric | YES | | |
| deposit_amount | numeric | YES | 0 | |
| services_used | jsonb | YES | '[]' | |
| prepayments | jsonb | YES | '[]' | |
| logs | jsonb | YES | '[]' | |
| room_charge_locked | numeric | YES | 0 | |
| status | text | YES | 'active' | |
| notes | text | YES | | |
| final_amount | numeric | YES | | |
| system_created_at | timestamp | YES | now() | |
| custom_surcharge | bigint | YES | 0 | |
| room_charge_suggested | bigint | YES | 0 | |
| room_charge_actual | bigint | YES | 0 | |
| audit_note | text | YES | '' | |
| payment_method | text | YES | | |
| surcharge | numeric | YES | 0 | |
| total_amount | numeric | YES | 0 | |
| deleted_at | timestamp | YES | | |
| service_charge_actual | numeric | YES | 0 | |
| amount_paid | numeric | YES | 0 | |

### cashflow
Bảng lưu thông tin dòng tiền (thu/chi).

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| type | text | NO | | |
| category | text | NO | 'Chưa phân loại' | |
| content | text | NO | | |
| amount | numeric | NO | 0 | |
| payment_method | text | NO | | |
| created_by | text | NO | | |
| created_at | timestamp | YES | now() | |
| notes | text | YES | | |
| category_id | text | YES | | |
| category_name | text | YES | 'Chưa phân loại' | |
| deleted_at | timestamp | YES | | |
| created_by_id | uuid | YES | | |

### cashflow_categories
Danh mục các loại thu/chi.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| name | text | NO | | |
| type | text | NO | | |
| color | text | YES | '#3b82f6' | |
| is_system | boolean | YES | false | |
| created_at | timestamp | YES | now() | |

### customers
Bảng thông tin khách hàng.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | uuid_generate_v4() | Primary Key |
| full_name | text | YES | | |
| phone | text | YES | | |
| id_card | text | YES | | |
| address | text | YES | | |
| total_spent | numeric | YES | 0 | |
| visit_count | integer | YES | 0 | |
| ocr_data | jsonb | YES | '{}' | |
| created_at | timestamp | YES | now() | |
| notes | text | YES | | |
| last_visit | timestamp | YES | | |
| loyalty_points | integer | YES | 0 | |
| deleted_at | timestamp | YES | | |
| balance | numeric | YES | 0 | Số dư công nợ (Âm là nợ, Dương là dư) |

### debt_transactions
Bảng lưu các giao dịch liên quan đến công nợ.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| customer_id | uuid | YES | | Foreign Key -> customers(id) |
| booking_id | uuid | YES | | Foreign Key -> bookings(id) |
| amount | numeric | NO | 0 | |
| status | text | NO | 'unpaid' | |
| created_at | timestamp | NO | utc_now | |
| updated_at | timestamp | NO | utc_now | |
| due_date | timestamp | YES | | |
| notes | text | YES | | |
| created_by | uuid | YES | | |
| customer_name | text | YES | | |
| room_number | text | YES | | |
| paid_at | timestamp | YES | | |

### expenses
Bảng lưu chi phí phát sinh.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | uuid_generate_v4() | Primary Key |
| category | text | YES | | |
| amount | numeric | NO | | |
| description | text | YES | | |
| expense_date | date | YES | CURRENT_DATE | |

### financial_transactions
Bảng lưu các giao dịch tài chính chi tiết.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | uuid_generate_v4() | Primary Key |
| booking_id | uuid | YES | | Foreign Key -> bookings(id) |
| customer_id | uuid | NO | | Foreign Key -> customers(id) |
| staff_id | uuid | YES | | |
| transaction_type | text | NO | | |
| amount | numeric | NO | | |
| payment_method | text | YES | 'CASH' | |
| description | text | YES | | |
| created_at | timestamp | YES | now() | |
| transaction_id | uuid | YES | | Foreign Key -> transactions(id) |
| type | text | YES | | |
| method | text | YES | | |
| cashier | text | YES | | |
| notes | text | YES | | |
| meta | jsonb | YES | '{}' | |

### inventory_audit_details
Chi tiết kiểm kê kho.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| audit_id | uuid | YES | | Foreign Key -> inventory_audits(id) |
| service_id | uuid | YES | | Foreign Key -> services(id) |
| service_name | text | YES | | |
| system_stock | integer | YES | | |
| actual_stock | integer | YES | | |
| discrepancy | integer | YES | | |
| created_at | timestamp | YES | now() | |

### inventory_audits
Thông tin các đợt kiểm kê kho.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| created_at | timestamp | YES | now() | |
| staff_id | uuid | YES | | |
| staff_name | text | YES | | |
| notes | text | YES | | |

### invoices
Bảng lưu thông tin hóa đơn đã in.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | uuid_generate_v4() | Primary Key |
| booking_id | uuid | YES | | |
| room_name | text | YES | | |
| customer_name | text | YES | | |
| total_amount | numeric | YES | | |
| final_collection | numeric | YES | | |
| created_at | timestamp | YES | now() | |
| customer_id | uuid | YES | | Foreign Key -> customers(id) |
| room_id | uuid | YES | | Foreign Key -> rooms(id) |
| payment_method | text | YES | | |

### ledger
Sổ cái ghi chép mọi biến động tài chính và công nợ.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| shift_id | uuid | YES | | Foreign Key -> shifts(id) |
| booking_id | uuid | YES | | Foreign Key -> bookings(id) |
| customer_id | uuid | YES | | Foreign Key -> customers(id) |
| staff_id | uuid | NO | | Foreign Key -> profiles(id) |
| type | text | NO | | |
| category | text | NO | | |
| amount | numeric | NO | | |
| payment_method_code | text | YES | | Foreign Key -> payment_methods(code) |
| description | text | YES | | |
| status | text | YES | 'completed' | |
| void_reason | text | YES | | |
| void_by | uuid | YES | | Foreign Key -> profiles(id) |
| meta | jsonb | YES | '{}' | |
| created_at | timestamp | YES | now() | |

### payment_methods
Danh sách các phương thức thanh toán.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| code | text | NO | | Unique Code |
| name | text | NO | | |
| is_active | boolean | YES | true | |
| created_at | timestamp | YES | now() | |

### profiles
Thông tin nhân viên và phân quyền.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | | Primary Key (UID từ Auth) |
| username | text | NO | | |
| full_name | text | NO | | |
| role | text | NO | | |
| phone | text | YES | | |
| permissions | ARRAY | YES | | |
| created_at | timestamp | YES | now() | |

### room_checks
Thông tin kiểm tra phòng (vệ sinh/dịch vụ).

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| room_id | uuid | YES | | Foreign Key -> rooms(id) |
| booking_id | uuid | YES | | Foreign Key -> bookings(id) |
| status | text | NO | 'pending' | |
| requested_by | uuid | YES | | |
| assigned_to | uuid | YES | | |
| completed_at | timestamp | YES | | |
| notes | text | YES | | |
| service_adjustments | jsonb | YES | '[]' | |
| created_at | timestamp | YES | now() | |

### rooms
Bảng thông tin các phòng.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | uuid_generate_v4() | Primary Key |
| room_number | text | NO | | |
| room_type | text | YES | | |
| area | text | YES | | |
| status | text | YES | 'available' | |
| prices | jsonb | YES | '{"daily":...}' | |
| enable_overnight | boolean | YES | true | |
| current_booking_id | uuid | YES | | |
| voice_alias | text | YES | | |
| last_status_change | timestamp | YES | | |

### service_categories
Danh mục các loại dịch vụ (nước, đồ ăn, v.v.).

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| name | text | NO | | |
| description | text | YES | | |
| created_at | timestamp | YES | now() | |

### services
Danh sách các dịch vụ/sản phẩm.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| name | text | NO | | |
| price | numeric | YES | 0 | |
| unit | text | YES | 'Cái' | |
| is_active | boolean | YES | true | |
| stock | integer | YES | 0 | |
| service_category_id | uuid | YES | | Foreign Key -> service_categories(id) |
| created_at | timestamp | YES | now() | |
| deleted_at | timestamp | YES | | |

### settings
Cấu hình hệ thống.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| key | text | NO | | Primary Key |
| value | jsonb | YES | | |
| tax_code | text | YES | | |
| tax_config | jsonb | YES | '{"vat":8,...}' | |

### shifts
Thông tin các ca làm việc.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| staff_id | uuid | NO | | Foreign Key -> profiles(id) |
| start_at | timestamp | NO | now() | |
| end_at | timestamp | YES | | |
| opening_balance | numeric | YES | 0 | |
| closing_balance | numeric | YES | | |
| expected_balance | numeric | YES | | |
| status | text | YES | 'open' | |
| notes | text | YES | | |
| created_at | timestamp | YES | now() | |

### stock_history
Lịch sử nhập/xuất kho.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| service_id | uuid | YES | | Foreign Key -> services(id) |
| action_type | text | YES | | |
| quantity | integer | NO | | |
| details | jsonb | YES | '{}' | |
| created_at | timestamp | YES | now() | |

### transactions
Ghi chép các giao dịch tổng quát.

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| booking_id | uuid | YES | | Foreign Key -> bookings(id) |
| customer_id | uuid | YES | | Foreign Key -> customers(id) |
| type | text | NO | | |
| amount | numeric | NO | | |
| method | text | YES | | |
| cashier | text | YES | | |
| notes | text | YES | | |
| reference_id | uuid | YES | | |
| created_at | timestamp | YES | now() | |
| meta | jsonb | YES | '{}' | |

### user_push_tokens
Lưu token để gửi thông báo đẩy (Push Notifications).

| Cột | Kiểu dữ liệu | Nullable | Default | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| id | uuid | NO | gen_random_uuid() | Primary Key |
| user_id | uuid | YES | | |
| token | text | NO | | |
| device_type | text | YES | | |
| last_seen | timestamp | YES | now() | |
| created_at | timestamp | YES | now() | |

---

## 2. Các View (Views)

### debtor_overview
View tổng quan tình hình nợ của khách hàng.

| Cột | Kiểu dữ liệu | Ghi chú |
| :--- | :--- | :--- |
| id | uuid | ID khách hàng |
| full_name | text | |
| phone | text | |
| balance | numeric | Số dư hiện tại |
| last_stay_date | timestamp | Ngày ở cuối cùng |
| total_spent | numeric | Tổng tiền đã tiêu |
| created_at | timestamp | |

### view_pending_services
View danh sách dịch vụ đang chờ xử lý.

| Cột | Kiểu dữ liệu | Ghi chú |
| :--- | :--- | :--- |
| room_number | text | |
| booking_id | uuid | |
| check_in_at | timestamp | |
| service_name | text | |
| quantity | integer | |
| price | numeric | |
| total_amount | numeric | |

---

*Tài liệu được cập nhật tự động vào ngày 2026-01-05.*
