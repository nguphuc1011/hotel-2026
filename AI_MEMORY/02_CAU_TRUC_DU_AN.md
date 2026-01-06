# Báo cáo Schema Ledger Unification (05-01-2026)

## Bảng: ledger

### Cột
| column_name            | data_type                    | is_nullable | column_default        |
|------------------------|------------------------------|------------|-----------------------|
| id                     | uuid                         | NO         | gen_random_uuid()     |
| shift_id               | uuid                         | YES        |                       |
| booking_id             | uuid                         | YES        |                       |
| customer_id            | uuid                         | YES        |                       |
| staff_id               | uuid                         | NO         |                       |
| type                   | text                         | NO         |                       |
| category               | text                         | NO         |                       |
| amount                 | numeric                      | NO         |                       |
| payment_method_code    | text                         | YES        |                       |
| description            | text                         | YES        |                       |
| status                 | text                         | YES        | 'completed'::text     |
| void_reason            | text                         | YES        |                       |
| void_by                | uuid                         | YES        |                       |
| meta                   | jsonb                        | YES        | '{}'::jsonb           |
| created_at             | timestamp with time zone     | YES        | now()                 |

### Ràng buộc (Constraints)
- CHECK: status IN ('completed', 'void')
- CHECK: type IN ('REVENUE','PAYMENT','DEPOSIT','REFUND','EXPENSE','DEBT_ADJUSTMENT')
- FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
- FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
- FOREIGN KEY (payment_method_code) REFERENCES payment_methods(code)
- FOREIGN KEY (shift_id) REFERENCES shifts(id)
- FOREIGN KEY (staff_id) REFERENCES profiles(id)
- FOREIGN KEY (void_by) REFERENCES profiles(id)
- PRIMARY KEY (id)

## Bảng: customers

### Cột
| column_name     | data_type                    | is_nullable | column_default |
|-----------------|------------------------------|------------|----------------|
| id              | uuid                         | NO         | uuid_generate_v4() |
| full_name       | text                         | YES        |                |
| phone           | text                         | YES        |                |
| id_card         | text                         | YES        |                |
| address         | text                         | YES        |                |
| total_spent     | numeric                      | YES        | 0              |
| visit_count     | integer                      | YES        | 0              |
| ocr_data        | jsonb                        | YES        | '{}'::jsonb    |
| created_at      | timestamp with time zone     | YES        | now()          |
| notes           | text                         | YES        |                |
| last_visit      | timestamp with time zone     | YES        |                |
| loyalty_points  | integer                      | YES        | 0              |
| deleted_at      | timestamp with time zone     | YES        |                |
| balance         | numeric                      | YES        | 0              |

### Ràng buộc (Constraints)
- PRIMARY KEY (id)

## Danh sách bảng trong schema public (để kiểm chứng di trú)
- audit_logs
- bookings
- cashflow
- cashflow_categories
- customers
- debt_transactions
- expenses
- financial_transactions
- inventory_audit_details
- inventory_audits
- invoices
- ledger
- payment_methods
- profiles
- room_checks
- rooms
- service_categories
- services
- settings
- shifts
- stock_history
- transactions
- user_push_tokens

Ghi chú: Các bảng cũ transactions, cashflow, expenses vẫn tồn tại trong schema public, cho thấy quá trình xóa/hủy bỏ chưa được thực hiện hoàn toàn.

## Bằng chứng dữ liệu gần nhất từ ledger (10 bản ghi mới nhất)
| id                                   | type             | category         | amount  | payment_method_code | status     | created_at                | booking_id                            | customer_id                           | staff_id                              | description                                           |
|--------------------------------------|------------------|------------------|---------|---------------------|------------|---------------------------|---------------------------------------|---------------------------------------|---------------------------------------|-------------------------------------------------------|
| f3258af8-e20f-490f-8277-af6110414536 | PAYMENT          | ROOM             | 140000  | CASH                | completed  | 2026-01-05T14:16:21.069Z  | fd80ec17-bc78-4056-b0ea-cb5495a5c5e2 | 05b2a1dd-6018-44c2-ab3e-231840fc6c21 | 62de672f-07de-49c5-ae41-d79ec074d58d | Thanh toán checkout                                  |
| 8f23523c-3c8b-40f2-907c-d4ab45199064 | DEBT_ADJUSTMENT  | DEBT_COLLECTION  | -650000 |                     | completed  | 2026-01-04T20:07:07.500Z  | 512c69f8-6a1f-41a6-b07b-70dd1e1d0310 | 05b2a1dd-6018-44c2-ab3e-231840fc6c21 | 62de672f-07de-49c5-ae41-d79ec074d58d | Nợ chưa thanh toán từ hóa đơn này                    |
| 927cc5a1-b67f-40a0-850b-75eb316cc30a | DEBT_ADJUSTMENT  | DEBT_COLLECTION  | 400000  |                     | completed  | 2026-01-04T19:58:49.803Z  | 512c69f8-6a1f-41a6-b07b-70dd1e1d0310 | 05b2a1dd-6018-44c2-ab3e-231840fc6c21 | 62de672f-07de-49c5-ae41-d79ec074d58d | Gộp nợ cũ 400000 vào đơn mới                         |
| 24e6d2f8-5d76-4c7f-8712-2fd5dd201c6a | DEBT_ADJUSTMENT  | DEBT_COLLECTION  | -400000 |                     | completed  | 2026-01-04T19:58:35.419Z  | dcdca229-5122-45ac-8bdf-af38f704d91a | 05b2a1dd-6018-44c2-ab3e-231840fc6c21 | 62de672f-07de-49c5-ae41-d79ec074d58d | Nợ chưa thanh toán từ hóa đơn này                    |
| f9db1996-4542-4954-ac54-dabc6ebed890 | DEBT_ADJUSTMENT  | DEBT_COLLECTION  | 150000  |                     | completed  | 2026-01-04T19:53:04.940Z  | dcdca229-5122-45ac-8bdf-af38f704d91a | 05b2a1dd-6018-44c2-ab3e-231840fc6c21 | 62de672f-07de-49c5-ae41-d79ec074d58d | Gộp nợ cũ 150000 vào đơn mới                         |
| d64b934d-420a-4f47-a8ba-667cadf0b665 | REVENUE          | ROOM             | 150000  |                     | completed  | 2026-01-04T19:52:48.065Z  | 6ac31418-a36e-4ea9-8154-f3efef832c40 | 05b2a1dd-6018-44c2-ab3e-231840fc6c21 | 62de672f-07de-49c5-ae41-d79ec074d58d | Doanh thu phòng 7c3bdb06-0d4e-4b00-89f9-7c82f930bd27 |
| 67ee3ce3-c774-4be3-a592-0b9c112e8e15 | DEBT_ADJUSTMENT  | DEBT_COLLECTION  | 150000  |                     | completed  | 2026-01-04T19:52:48.065Z  | 6ac31418-a36e-4ea9-8154-f3efef832c40 | 05b2a1dd-6018-44c2-ab3e-231840fc6c21 | 62de672f-07de-49c5-ae41-d79ec074d58d | Nợ mới phát sinh từ hóa đơn                            |
| 5fb37639-1539-4e8e-bede-5ab42e7a1683 | REVENUE          | ROOM             | 250000  | CASH                | completed  | 2026-01-04T18:17:26.996Z  | f0244029-dcf8-4e5d-be50-f38224e2d61f | 05b2a1dd-6018-44c2-ab3e-231840fc6c21 | 62de672f-07de-49c5-ae41-d79ec074d58d | Thanh toán checkout phòng 201                         |

Nguồn dữ liệu: SELECT * FROM public.ledger ORDER BY created_at DESC LIMIT 10

