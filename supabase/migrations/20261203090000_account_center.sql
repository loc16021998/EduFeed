-- ═══════════════════════════════════════════════════════════════════════════
-- Account center ("Cài đặt & Tài khoản"): one profile API for every signed-in role,
-- self-service name / avatar, in-app account deletion requests (App Store / Google Play),
-- and an admin editor for the store version gate (app_release_config).
--
--   my_account()                       → who am I (role, name, phone, email, avatar, campus, Zalo, deletion)
--   update_my_profile(name, avatar)    → parent: users · staff: staff_profiles
--   request_account_deletion(reason)   → one pending request per account
--   cancel_account_deletion()
--   admin_deletion_requests(status)    → admin list
--   admin_resolve_deletion(id, status) → DONE deactivates a parent account / CANCELLED
--   admin_release_config_save(...)     → upsert one platform row
--
-- Avatars: public bucket "avatars", each account writes only inside its own <auth uid>/ folder.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.staff_profiles add column if not exists avatar_url text;

alter table public.users drop constraint if exists users_avatar_url_check;
-- NOT VALID: rows written before this migration are left alone; every new write is checked.
alter table public.users add constraint users_avatar_url_check check (avatar_url is null or (avatar_url ~* '^https://' and char_length(avatar_url) <= 500)) not valid;
alter table public.staff_profiles drop constraint if exists staff_profiles_avatar_url_check;
alter table public.staff_profiles add constraint staff_profiles_avatar_url_check check (avatar_url is null or (avatar_url ~* '^https://' and char_length(avatar_url) <= 500));

-- ─── Deletion requests ──────────────────────────────────────────────────────

create table if not exists public.account_deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users (id) on delete cascade,
  role          text not null check (role in ('PARENT', 'TEACHER', 'ADVISOR', 'MANAGER', 'ADMIN')),
  display_name  text not null,
  contact       text not null,
  reason        text check (reason is null or char_length(reason) <= 500),
  status        text not null default 'PENDING' check (status in ('PENDING', 'DONE', 'CANCELLED')),
  handled_by    uuid references auth.users (id) on delete set null,
  handled_at    timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists account_deletion_one_pending on public.account_deletion_requests (auth_user_id) where status = 'PENDING';

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

-- ─── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.account_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_staff() then public.staff_kind()
    when public.current_parent_id() is not null then 'PARENT'
  end;
$$;
grant execute on function public.account_role() to authenticated;

-- ─── my_account ─────────────────────────────────────────────────────────────

create or replace function public.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.account_role();
  v_uid uuid := auth.uid();
  v_email text;
  v_out jsonb;
begin
  if v_uid is null or v_role is null then
    raise exception 'Cần đăng nhập' using hint = 'UNAUTHORIZED';
  end if;
  select email into v_email from auth.users where id = v_uid;

  if v_role = 'PARENT' then
    select jsonb_build_object(
      'role', 'PARENT', 'fullName', u.full_name, 'phone', u.phone, 'email', null, 'avatarUrl', u.avatar_url,
      'campus', (select s.campus_location from public.parent_student_links l join public.students s on s.id = l.student_id
                 where l.parent_id = u.id order by l.is_primary desc, l.created_at limit 1),
      'zaloLinked', u.zalo_id is not null)
      into v_out
      from public.users u where u.id = public.current_parent_id();
  else
    select jsonb_build_object(
      'role', v_role,
      'fullName', coalesce(p.display_name, split_part(coalesce(v_email, ''), '@', 1)),
      'phone', p.phone, 'email', v_email, 'avatarUrl', p.avatar_url, 'campus', p.campus_location, 'zaloLinked', false)
      into v_out
      from (select 1) x left join public.staff_profiles p on p.user_id = v_uid;
  end if;

  return v_out || jsonb_build_object('deletionPending',
    exists (select 1 from public.account_deletion_requests d where d.auth_user_id = v_uid and d.status = 'PENDING'));
end $$;
grant execute on function public.my_account() to authenticated;

-- ─── update_my_profile ──────────────────────────────────────────────────────

create or replace function public.update_my_profile(p_full_name text, p_avatar_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.account_role();
  v_name text := btrim(coalesce(p_full_name, ''));
  v_avatar text := nullif(btrim(coalesce(p_avatar_url, '')), '');
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Cần đăng nhập' using hint = 'UNAUTHORIZED';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Tên cần từ 2 đến 60 ký tự' using hint = 'VALIDATION:fullName';
  end if;
  if v_name ~ '[<>{}]|https?://' then
    raise exception 'Tên không được chứa đường link hay ký tự đặc biệt' using hint = 'VALIDATION:fullName';
  end if;
  if v_avatar is not null and (v_avatar !~* '^https://' or char_length(v_avatar) > 500) then
    raise exception 'Ảnh đại diện không hợp lệ' using hint = 'VALIDATION:avatar';
  end if;

  if v_role = 'PARENT' then
    update public.users set full_name = v_name, avatar_url = v_avatar where id = public.current_parent_id();
  else
    insert into public.staff_profiles (user_id, kind, display_name, avatar_url, updated_by)
    values (auth.uid(), case when v_role in ('TEACHER', 'ADVISOR') then v_role else 'MANAGER' end, v_name, v_avatar, auth.uid())
    on conflict (user_id) do update set display_name = excluded.display_name, avatar_url = excluded.avatar_url,
                                       updated_by = auth.uid(), updated_at = now();
  end if;
  return public.my_account();
end $$;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- ─── Deletion: self-service ─────────────────────────────────────────────────

create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me jsonb := public.my_account();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Lý do tối đa 500 ký tự' using hint = 'VALIDATION:reason';
  end if;
  if (v_me ->> 'deletionPending')::boolean then
    raise exception 'Yêu cầu xoá tài khoản đã được gửi, trung tâm đang xử lý' using hint = 'CONFLICT';
  end if;
  insert into public.account_deletion_requests (auth_user_id, role, display_name, contact, reason)
  values (auth.uid(), v_me ->> 'role', v_me ->> 'fullName', coalesce(v_me ->> 'phone', v_me ->> 'email', ''), v_reason);
  return public.my_account();
end $$;
grant execute on function public.request_account_deletion(text) to authenticated;

create or replace function public.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.account_role() is null then
    raise exception 'Cần đăng nhập' using hint = 'UNAUTHORIZED';
  end if;
  update public.account_deletion_requests set status = 'CANCELLED', handled_by = auth.uid(), handled_at = now()
   where auth_user_id = auth.uid() and status = 'PENDING';
  return public.my_account();
end $$;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ─── Deletion: admin ────────────────────────────────────────────────────────

create or replace function public.admin_deletion_requests(p_status text default 'PENDING')
returns table (id uuid, role text, display_name text, contact text, reason text, status text, created_at timestamptz, handled_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên' using hint = 'FORBIDDEN';
  end if;
  return query
    select d.id, d.role, d.display_name, d.contact, d.reason, d.status, d.created_at, d.handled_at
      from public.account_deletion_requests d
     where p_status is null or d.status = p_status
     order by d.created_at desc
     limit 200;
end $$;
grant execute on function public.admin_deletion_requests(text) to authenticated;

create or replace function public.admin_resolve_deletion(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.account_deletion_requests;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên' using hint = 'FORBIDDEN';
  end if;
  if p_status not in ('DONE', 'CANCELLED') then
    raise exception 'Trạng thái không hợp lệ' using hint = 'VALIDATION:status';
  end if;
  select * into v_req from public.account_deletion_requests where id = p_id for update;
  if not found then
    raise exception 'Không tìm thấy yêu cầu' using hint = 'NOT_FOUND';
  end if;
  if v_req.status <> 'PENDING' then
    raise exception 'Yêu cầu đã được xử lý' using hint = 'CONFLICT';
  end if;
  update public.account_deletion_requests set status = p_status, handled_by = auth.uid(), handled_at = now() where id = p_id;
  -- DONE on a parent: the account stops signing in and its personal details are cleared.
  -- (The child's learning history stays with the centre; staff accounts are disabled in Tài khoản nhân viên.)
  if p_status = 'DONE' and v_req.role = 'PARENT' then
    update public.users set is_active = false, avatar_url = null, zalo_id = null where auth_user_id = v_req.auth_user_id;
  end if;
end $$;
grant execute on function public.admin_resolve_deletion(uuid, text) to authenticated;

-- ─── Release config: admin editor ───────────────────────────────────────────

create or replace function public.admin_release_config_save(
  p_platform text, p_min_supported_version text, p_latest_version text,
  p_store_url text, p_release_notes_vi text, p_is_force_update boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên' using hint = 'FORBIDDEN';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'Nền tảng không hợp lệ' using hint = 'VALIDATION:platform';
  end if;
  if coalesce(p_min_supported_version, '') !~ '^\d{1,6}(\.\d{1,6}){0,2}$' then
    raise exception 'Phiên bản tối thiểu dạng 1.2.3' using hint = 'VALIDATION:minSupportedVersion';
  end if;
  if coalesce(p_latest_version, '') !~ '^\d{1,6}(\.\d{1,6}){0,2}$' then
    raise exception 'Phiên bản mới nhất dạng 1.2.3' using hint = 'VALIDATION:latestVersion';
  end if;
  if coalesce(p_store_url, '') <> '' and p_store_url !~* '^https://' then
    raise exception 'Link cửa hàng phải bắt đầu bằng https://' using hint = 'VALIDATION:storeUrl';
  end if;
  if char_length(coalesce(p_release_notes_vi, '')) > 600 then
    raise exception 'Ghi chú tối đa 600 ký tự' using hint = 'VALIDATION:releaseNotesVi';
  end if;
  insert into public.app_release_config (platform, min_supported_version, latest_version, store_url, release_notes_vi, is_force_update)
  values (p_platform, p_min_supported_version, p_latest_version, coalesce(p_store_url, ''), coalesce(p_release_notes_vi, ''), coalesce(p_is_force_update, false))
  on conflict (platform) do update set
    min_supported_version = excluded.min_supported_version, latest_version = excluded.latest_version,
    store_url = excluded.store_url, release_notes_vi = excluded.release_notes_vi, is_force_update = excluded.is_force_update;
end $$;
grant execute on function public.admin_release_config_save(text, text, text, text, text, boolean) to authenticated;

-- ─── Avatars bucket ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "own avatar upload" on storage.objects;
create policy "own avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists "own avatar update" on storage.objects;
create policy "own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists "own avatar delete" on storage.objects;
create policy "own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
