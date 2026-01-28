# BÁO CÁO CẬP NHẬT LOGIC BILLING ENGINE
**Ngày:** 29/01/2026
**Người thực hiện:** Trae AI
**Yêu cầu:** Cập nhật logic ân hạn từng Block cho tính tiền theo Giờ (Hourly).

## Chi tiết thay đổi (File: src/lib/billing_engine.sql)

### Logic Cũ:
```sql
            -- Hourly Late Grace
            IF v_grace_out_enabled AND v_remaining_min <= v_grace_minutes THEN
                v_explanations := array_append(v_explanations, format('Quá giờ %s phút (trong mức miễn phí %s phút): Không tính thêm tiền', ROUND(v_remaining_min,0), v_grace_minutes));
                v_remaining_min := 0;
            END IF;
            
            IF v_remaining_min > 0 THEN
                v_next_blocks := CEIL(v_remaining_min / v_hourly_unit);
                v_total_charge := v_total_charge + (v_next_blocks * v_price_next);
                v_explanations := array_append(v_explanations, format('Quá giờ %s phút (vượt mức miễn phí %s phút): Tính thêm %s block lẻ x %sđ = %sđ', 
                    ROUND(v_remaining_min,0), v_grace_minutes, v_next_blocks, public.fn_format_money_vi(v_price_next), public.fn_format_money_vi(v_next_blocks * v_price_next)));
            END IF;
```

### Logic Mới (Đã cập nhật):
```sql
            -- [LOGIC MỚI] Khoan hồng từng Block (Grace per Block)
            -- Nguyên tắc: Tính số block trọn vẹn + Xử lý phần dư của block cuối cùng
            
            DECLARE
                v_remainder_min numeric;
            BEGIN
                -- Tính số block trọn vẹn (ví dụ: 65 phút / 60 = 1 block trọn)
                v_next_blocks := FLOOR(v_remaining_min / v_hourly_unit);
                
                -- Tính phần dư (ví dụ: 65 % 60 = 5 phút)
                v_remainder_min := MOD(v_remaining_min, v_hourly_unit);
                
                IF v_remainder_min > 0 THEN
                    -- Nếu phần dư > ân hạn -> Tính thêm 1 block
                    IF (NOT v_grace_out_enabled) OR (v_remainder_min > v_grace_minutes) THEN
                        v_next_blocks := v_next_blocks + 1;
                        v_explanations := array_append(v_explanations, format('Block lẻ %s phút (> %s phút ân hạn) -> Tính tròn 1 block', ROUND(v_remainder_min, 0), v_grace_minutes));
                    ELSE
                        -- Nếu phần dư <= ân hạn -> Miễn phí block này
                        v_explanations := array_append(v_explanations, format('Block lẻ %s phút (<= %s phút ân hạn) -> Miễn phí', ROUND(v_remainder_min, 0), v_grace_minutes));
                    END IF;
                END IF;
            END;

            IF v_next_blocks > 0 THEN
                v_total_charge := v_total_charge + (v_next_blocks * v_price_next);
                v_explanations := array_append(v_explanations, format('Tổng tính thêm: %s block x %sđ = %sđ', 
                    v_next_blocks, public.fn_format_money_vi(v_price_next), public.fn_format_money_vi(v_next_blocks * v_price_next)));
            END IF;
```

## Kết quả kiểm nghiệm (Lý thuyết):
- **Trường hợp 1h 5p (Dư 5p):**
  - Block trọn: 0.
  - Dư: 5p <= 15p (Grace) -> Không cộng block.
  - Tổng block thêm: 0. -> **ĐÚNG**.
  
- **Trường hợp 2h 5p (Dư 65p):**
  - Block trọn: 1 (60p).
  - Dư: 5p <= 15p (Grace) -> Không cộng thêm.
  - Tổng block thêm: 1. -> **ĐÚNG**.

- **Trường hợp 1h 20p (Dư 20p):**
  - Block trọn: 0.
  - Dư: 20p > 15p -> Cộng 1 block.
  - Tổng block thêm: 1. -> **ĐÚNG**.
