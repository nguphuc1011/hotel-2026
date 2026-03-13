-- MIGRATION: UPDATE fn_resolve_policy TO GRANT ADMIN PRIVILEGES
CREATE OR REPLACE FUNCTION public.fn_resolve_policy(p_staff_id uuid, p_action_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
      DECLARE
          v_user_policy text;
          v_role_policy text;
          v_global_policy text;
          v_role text;
      BEGIN
          -- 1. Lấy vai trò của nhân viên
          SELECT role INTO v_role FROM public.staff WHERE id = p_staff_id;
          
          -- 2. ĐẶC QUYỀN ADMIN: Nếu là Admin, mặc định luôn là ALLOW (Trừ khi có User Override cụ thể)
          IF v_role = 'Admin' THEN
              -- Kiểm tra xem có User Override (Cá nhân) muốn thắt chặt hơn không
              SELECT policy_type INTO v_user_policy 
              FROM public.security_user_policies 
              WHERE staff_id = p_staff_id AND action_key = p_action_key;
              
              RETURN COALESCE(v_user_policy, 'ALLOW');
          END IF;
          
          -- 3. Logic cho các vai trò khác (Manager, Staff...)
          -- Layer 1: User Override (Cá nhân)
          SELECT policy_type INTO v_user_policy 
          FROM public.security_user_policies 
          WHERE staff_id = p_staff_id AND action_key = p_action_key;
          
          IF v_user_policy IS NOT NULL THEN
              RETURN v_user_policy;
          END IF;
          
          -- Layer 2: Role Override (Ma trận phân quyền theo vai trò)
          IF v_role IS NOT NULL THEN
              SELECT policy_type INTO v_role_policy
              FROM public.security_role_policies
              WHERE role = v_role AND action_key = p_action_key;
              
              IF v_role_policy IS NOT NULL THEN
                  RETURN v_role_policy;
              END IF;
          END IF;
          
          -- Layer 3: Global Setting (Cài đặt chung hệ thống)
          SELECT policy_type INTO v_global_policy
          FROM public.settings_security
          WHERE key = p_action_key;
          
          -- Fallback cuối cùng là PIN nếu không tìm thấy cấu hình
          RETURN COALESCE(v_global_policy, 'PIN');
      END;
      $function$;
