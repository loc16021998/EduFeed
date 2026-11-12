-- Cấp quyền QUẢN TRỊ (admin) cho một tài khoản — dùng cho tài khoản admin ĐẦU TIÊN.
-- Các tài khoản sau tạo ngay trong app: Trang quản trị (/quan-tri) → Tài khoản nhân viên.
--
-- 1. Supabase Dashboard → Authentication → Users → Add user → nhập email + mật khẩu,
--    tick "Auto Confirm User" → Create user.
-- 2. Sửa email bên dưới thành email vừa tạo → SQL Editor → Run.
-- 3. Đăng nhập lại trong app (quyền mới có hiệu lực khi đăng nhập lại).

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
where email = lower('email-cua-ban@example.com')
returning email, raw_app_meta_data ->> 'role' as role;
