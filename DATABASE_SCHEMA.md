# CẤU TRÚC DATABASE THỰC TẾ 
## Table: bookings 
-3→- Cột: id, room_id, customer_id, check_in_at, check_out_at, rental_type, initial_price, deposit_amount, services_used, status, final_amount, system_created_at, payment_method, surcharge, total_amount, amount_paid. 
- LƯU Ý: KHÔNG có cột `updated_at` hay `payment_status`. 
## Table: invoices 
- Cột: id, booking_id, room_name, customer_name, total_amount, final_collection, created_at. 
- LƯU Ý: KHÔNG có cột `status`, `payment_method` hay `customer_id`. 
## Table: rooms 
- Cột: id, room_number, status, current_booking_id, last_status_change. 
