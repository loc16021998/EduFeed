-- ─────────────────────────────────────────────────────────────────────────────
-- Parent portal: parent accounts (phone + Zalo ZNS OTP), students, parent ↔ student links, the electronic
-- contact book (daily_reports), leave / make-up requests, and admin account management.
--
-- Identity
--   public.users             one row per parent phone. auth_user_id links it to the Supabase Auth user the
--                            Edge Function creates on first OTP sign-in (app_metadata.role = 'parent').
--                            Staff / admin accounts stay in Auth (app_metadata.role) — `role` here is for
--                            parents now and leaves room for TEACHER / ADMIN profiles later.
--   current_parent_id()      the signed-in, ACTIVE parent's users.id — every parent rule goes through it,
--                            so deactivating an account cuts access immediately (no stale JWT claims).
-- Privacy
--   Parents see only students linked to them (parent_can_see). Children's work photos live in the PRIVATE
--   bucket `class-reports` under <student_id>/…, readable by those parents and staff via signed URLs.
--   Enrollments are not exposed to parents directly (they hold internal advisor notes); parent_portal()
--   returns curated fields.
-- OTP
--   parent_otps is service-role only. Codes are hashed by the Edge Function; 5-minute expiry, 5 attempts,
--   1 code / 60 s and 5 / hour per phone, 20 / hour per IP.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table public.users (
  id             uuid primary key default gen_random_uuid(),
  phone          text not null unique check (phone ~ '^0[35789][0-9]{8}$'),
  full_name      text not null check (char_length(btrim(full_name)) between 2 and 60),
  role           text not null default 'PARENT' check (role in ('PARENT', 'TEACHER', 'ADMIN')),
  zalo_id        text,
  avatar_url     text,
  is_active      boolean not null default true,
  auth_user_id   uuid unique references auth.users (id) on delete set null,
  referral_code  text not null unique default ('TH' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  last_login_at  timestamptz,
  -- null = the parent registered themself (OTP); else the admin who created the account.
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();

create table public.students (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null check (char_length(btrim(full_name)) between 2 and 60),
  birth_year       smallint check (birth_year is null or birth_year between 2008 and 2035),
  campus_location  text not null references public.branches (code) on update cascade,
  avatar_url       text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger students_set_updated_at before update on public.students for each row execute function public.set_updated_at();

create table public.parent_student_links (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid not null references public.users (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  relationship  text not null default 'OTHER' check (relationship in ('MOM', 'DAD', 'OTHER')),
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (parent_id, student_id)
);
create index parent_student_links_student_idx on public.parent_student_links (student_id);

-- Course sessions + weekly schedule on the existing enrollments.
alter table public.enrollments
  add column if not exists student_id uuid references public.students (id) on delete set null,
  add column if not exists sessions_total smallint check (sessions_total is null or sessions_total between 0 and 500),
  add column if not exists sessions_remaining smallint check (sessions_remaining is null or sessions_remaining between 0 and 500),
  -- [{"d": 2..8 (Thứ 2 … Chủ nhật = 8), "start": "17:30", "end": "19:00"}]
  add column if not exists schedule jsonb check (schedule is null or jsonb_typeof(schedule) = 'array');
create index if not exists enrollments_student_idx on public.enrollments (student_id);

-- The electronic contact book: one row per student, course and session.
create table public.daily_reports (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students (id) on delete cascade,
  enrollment_id      uuid references public.enrollments (id) on delete set null,
  course_code        text not null references public.categories (code) on update cascade,
  session_date       date not null,
  attendance         text not null default 'PRESENT' check (attendance in ('PRESENT', 'ABSENT', 'EXCUSED')),
  teacher_name       text not null check (char_length(btrim(teacher_name)) between 2 and 60),
  feedback_text      text check (feedback_text is null or char_length(feedback_text) <= 2000),
  -- Storage paths in the private bucket class-reports (<student_id>/<file>), not public URLs.
  media_urls         jsonb not null default '[]' check (jsonb_typeof(media_urls) = 'array' and jsonb_array_length(media_urls) <= 6),
  parent_liked       boolean not null default false,
  parent_reply       text check (parent_reply is null or char_length(parent_reply) <= 500),
  parent_replied_at  timestamptz,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (student_id, course_code, session_date)
);
create index daily_reports_student_idx on public.daily_reports (student_id, session_date desc);

create table public.attendance_requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students (id) on delete cascade,
  parent_id       uuid references public.users (id) on delete set null,
  type            text not null check (type in ('LEAVE', 'MAKEUP')),
  requested_date  date not null,
  reason          text not null check (char_length(btrim(reason)) between 3 and 300),
  status          text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  decision_note   text check (decision_note is null or char_length(decision_note) <= 300),
  created_at      timestamptz not null default now()
);
create unique index attendance_requests_once_idx on public.attendance_requests (student_id, type, requested_date) where status <> 'REJECTED';
create index attendance_requests_pending_idx on public.attendance_requests (created_at) where status = 'PENDING';

create table public.parent_otps (
  id                 uuid primary key default gen_random_uuid(),
  phone              text not null,
  code_hash          text not null,
  ip                 text,
  attempts           smallint not null default 0,
  expires_at         timestamptz not null,
  verified_at        timestamptz,
  signup_token_hash  text,
  signup_expires_at  timestamptz,
  consumed_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index parent_otps_phone_idx on public.parent_otps (phone, created_at desc);
create index parent_otps_ip_idx on public.parent_otps (ip, created_at desc);

-- ─── Access helpers ─────────────────────────────────────────────────────────

create or replace function public.current_parent_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where auth_user_id = auth.uid() and is_active and role = 'PARENT';
$$;

create or replace function public.parent_can_see(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.parent_student_links
                  where student_id = p_student_id and parent_id = public.current_parent_id());
$$;

-- ─── Row level security ─────────────────────────────────────────────────────

alter table public.users enable row level security;
alter table public.students enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.daily_reports enable row level security;
alter table public.attendance_requests enable row level security;
alter table public.parent_otps enable row level security;   -- no policies: service role only

create policy "parent reads own account" on public.users for select to authenticated
  using (auth_user_id = auth.uid() or public.is_admin());
create policy "linked parents and staff read students" on public.students for select to authenticated
  using (public.parent_can_see(id) or public.is_staff());
create policy "parent reads own links" on public.parent_student_links for select to authenticated
  using (parent_id = public.current_parent_id() or public.is_admin());
create policy "linked parents and staff read reports" on public.daily_reports for select to authenticated
  using (public.parent_can_see(student_id) or public.is_staff());
create policy "linked parents and staff read requests" on public.attendance_requests for select to authenticated
  using (public.parent_can_see(student_id) or public.is_staff());

-- Every write goes through the functions below.
revoke all on public.users, public.students, public.parent_student_links, public.daily_reports,
              public.attendance_requests, public.parent_otps from anon;
revoke insert, update, delete on public.users, public.students, public.parent_student_links, public.daily_reports,
              public.attendance_requests from authenticated;
revoke all on public.parent_otps from authenticated;

-- ─── Private storage for children's work ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-reports', 'class-reports', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_student_folder(p_name text)
returns uuid
language sql
immutable
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

create policy "staff upload class reports" on storage.objects for insert to authenticated
  with check (bucket_id = 'class-reports' and public.is_staff() and public.storage_student_folder(name) is not null);
create policy "staff delete class reports" on storage.objects for delete to authenticated
  using (bucket_id = 'class-reports' and public.is_staff());
create policy "linked parents and staff read class reports" on storage.objects for select to authenticated
  using (bucket_id = 'class-reports' and (public.is_staff() or public.parent_can_see(public.storage_student_folder(name))));

-- ─── OTP (service role, called by the Edge Function) ────────────────────────

create or replace function public.otp_issue(p_phone text, p_code_hash text, p_ip text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.parent_otps;
begin
  if p_phone !~ '^0[35789][0-9]{8}$' then
    raise exception 'Số điện thoại không hợp lệ' using hint = 'VALIDATION:phone';
  end if;
  if exists (select 1 from public.parent_otps where phone = p_phone and created_at > now() - interval '60 seconds') then
    raise exception 'Vui lòng đợi 60 giây trước khi gửi lại mã' using hint = 'RATE_LIMITED';
  end if;
  if (select count(*) from public.parent_otps where phone = p_phone and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Đã gửi quá nhiều mã cho số này. Vui lòng thử lại sau 1 giờ' using hint = 'RATE_LIMITED';
  end if;
  if p_ip is not null and (select count(*) from public.parent_otps where ip = p_ip and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Quá nhiều yêu cầu, vui lòng thử lại sau' using hint = 'RATE_LIMITED';
  end if;
  -- A new code replaces any earlier one.
  update public.parent_otps set expires_at = least(expires_at, now())
   where phone = p_phone and verified_at is null and expires_at > now();
  insert into public.parent_otps (phone, code_hash, ip, expires_at)
  values (p_phone, p_code_hash, left(p_ip, 64), now() + interval '5 minutes')
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'expires_at', v_row.expires_at);
end;
$$;

-- OK → existing active account (user_id) | NEEDS_PROFILE → new phone (stores the one-time signup token)
-- | DISABLED | INVALID (attempts_left) | EXPIRED | LOCKED
create or replace function public.otp_check(p_phone text, p_code_hash text, p_signup_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_otp  public.parent_otps;
  v_user public.users;
begin
  select * into v_otp from public.parent_otps
   where phone = p_phone and verified_at is null
   order by created_at desc limit 1
   for update;
  if not found or v_otp.expires_at <= now() then
    return jsonb_build_object('result', 'EXPIRED');
  end if;
  if v_otp.attempts >= 5 then
    return jsonb_build_object('result', 'LOCKED');
  end if;
  if v_otp.code_hash <> p_code_hash then
    update public.parent_otps set attempts = attempts + 1 where id = v_otp.id;
    if v_otp.attempts + 1 >= 5 then
      return jsonb_build_object('result', 'LOCKED');
    end if;
    return jsonb_build_object('result', 'INVALID', 'attempts_left', 5 - v_otp.attempts - 1);
  end if;

  update public.parent_otps set verified_at = now() where id = v_otp.id;
  select * into v_user from public.users where phone = p_phone;
  if found then
    if not v_user.is_active or v_user.role <> 'PARENT' then
      return jsonb_build_object('result', 'DISABLED');
    end if;
    update public.parent_otps set consumed_at = now() where id = v_otp.id;
    return jsonb_build_object('result', 'OK', 'user_id', v_user.id);
  end if;
  update public.parent_otps
     set signup_token_hash = p_signup_token_hash, signup_expires_at = now() + interval '15 minutes'
   where id = v_otp.id;
  return jsonb_build_object('result', 'NEEDS_PROFILE');
end;
$$;

-- New phone after OTP: parent + first child + link, in one transaction.
create or replace function public.parent_signup(
  p_phone text, p_signup_token_hash text, p_parent_name text, p_child_name text,
  p_birth_year smallint, p_campus text, p_relationship text default 'OTHER')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_otp     public.parent_otps;
  v_user    public.users;
  v_student uuid;
begin
  select * into v_otp from public.parent_otps
   where phone = p_phone and signup_token_hash = p_signup_token_hash
     and signup_expires_at > now() and consumed_at is null
   for update;
  if not found then
    raise exception 'Phiên xác thực đã hết hạn, vui lòng nhận mã OTP mới' using hint = 'UNAUTHORIZED';
  end if;
  if char_length(btrim(coalesce(p_parent_name, ''))) not between 2 and 60 then
    raise exception 'Tên phụ huynh cần 2–60 ký tự' using hint = 'VALIDATION:parentName';
  end if;
  if char_length(btrim(coalesce(p_child_name, ''))) not between 2 and 60 then
    raise exception 'Tên của bé cần 2–60 ký tự' using hint = 'VALIDATION:childName';
  end if;
  if p_birth_year is not null and p_birth_year not between 2008 and 2035 then
    raise exception 'Năm sinh của bé không hợp lệ' using hint = 'VALIDATION:birthYear';
  end if;
  if not exists (select 1 from public.branches where code = p_campus) then
    raise exception 'Chọn cơ sở' using hint = 'VALIDATION:campus';
  end if;
  update public.parent_otps set consumed_at = now() where id = v_otp.id;

  insert into public.users (phone, full_name, role)
  values (p_phone, btrim(p_parent_name), 'PARENT')
  on conflict (phone) do nothing
  returning * into v_user;
  if v_user.id is null then
    -- Created meanwhile (admin or a parallel request): just sign in.
    select * into v_user from public.users where phone = p_phone;
    return jsonb_build_object('user_id', v_user.id, 'created', false);
  end if;
  insert into public.students (full_name, birth_year, campus_location)
  values (btrim(p_child_name), p_birth_year, p_campus) returning id into v_student;
  insert into public.parent_student_links (parent_id, student_id, relationship, is_primary)
  values (v_user.id, v_student, case when p_relationship in ('MOM', 'DAD') then p_relationship else 'OTHER' end, true);
  return jsonb_build_object('user_id', v_user.id, 'created', true);
end;
$$;

create or replace function public.parent_auth_context(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', id, 'phone', phone, 'full_name', full_name, 'auth_user_id', auth_user_id, 'is_active', is_active)
  from public.users where id = p_user_id;
$$;

create or replace function public.parent_attach_auth(p_user_id uuid, p_auth_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.users set auth_user_id = p_auth_user_id, last_login_at = now() where id = p_user_id;
$$;

-- ─── Parent portal (signed-in parent) ───────────────────────────────────────

create or replace function public.parent_portal()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parent uuid := public.current_parent_id();
begin
  if v_parent is null then
    raise exception 'Cần đăng nhập tài khoản phụ huynh' using hint = 'UNAUTHORIZED';
  end if;
  return (
    select jsonb_build_object(
      'parent', jsonb_build_object('id', u.id, 'full_name', u.full_name, 'phone', u.phone, 'referral_code', u.referral_code),
      'students', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'full_name', s.full_name, 'birth_year', s.birth_year, 'campus_location', s.campus_location,
          'branch_name', b.name, 'avatar_url', s.avatar_url, 'relationship', l.relationship,
          'enrollments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', e.id, 'course_code', e.course_code, 'course_name', c.name, 'level', e.level, 'status', e.status,
              'sessions_total', e.sessions_total, 'sessions_remaining', e.sessions_remaining, 'schedule', e.schedule,
              'start_date', e.start_date, 'end_date', e.end_date, 'certificate_code', e.certificate_code,
              'payment_status', e.payment_status,
              'open_invoice_id', (select t.id from public.tuition_invoices t where t.enrollment_id = e.id and t.status = 'PENDING_PAYMENT'))
              order by (e.status = 'ACTIVE') desc, e.start_date desc)
            from public.enrollments e join public.categories c on c.code = e.course_code
            where e.student_id = s.id and e.status <> 'DROPPED'), '[]'::jsonb),
          'attendance', (
            select jsonb_build_object(
              'present', count(*) filter (where r.attendance = 'PRESENT'),
              'absent', count(*) filter (where r.attendance = 'ABSENT'),
              'excused', count(*) filter (where r.attendance = 'EXCUSED'))
            from public.daily_reports r where r.student_id = s.id))
          order by l.is_primary desc, s.created_at)
        from public.parent_student_links l
        join public.students s on s.id = l.student_id
        join public.branches b on b.code = s.campus_location
        where l.parent_id = u.id), '[]'::jsonb),
      'requests', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'student_id', a.student_id, 'type', a.type, 'requested_date', a.requested_date, 'reason', a.reason,
          'status', a.status, 'decision_note', a.decision_note, 'created_at', a.created_at) order by a.created_at desc)
        from (select * from public.attendance_requests x
               where x.student_id in (select student_id from public.parent_student_links where parent_id = u.id)
               order by x.created_at desc limit 20) a), '[]'::jsonb))
    from public.users u where u.id = v_parent);
end;
$$;

create or replace function public.parent_reports(p_student_id uuid, p_before date default null, p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.parent_can_see(p_student_id) and not public.is_staff() then
    raise exception 'Không có quyền xem sổ liên lạc của học viên này' using hint = 'FORBIDDEN';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'course_code', r.course_code, 'course_name', c.name, 'session_date', r.session_date,
      'attendance', r.attendance, 'teacher_name', r.teacher_name, 'feedback_text', r.feedback_text,
      'media_urls', r.media_urls, 'parent_liked', r.parent_liked, 'parent_reply', r.parent_reply,
      'parent_replied_at', r.parent_replied_at, 'created_at', r.created_at) order by r.session_date desc, r.created_at desc)
    from (select * from public.daily_reports
           where student_id = p_student_id and (p_before is null or session_date < p_before)
           order by session_date desc, created_at desc
           limit least(greatest(coalesce(p_limit, 10), 1), 30)) r
    join public.categories c on c.code = r.course_code), '[]'::jsonb);
end;
$$;

create or replace function public.parent_report_react(p_report_id uuid, p_liked boolean, p_reply text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.daily_reports;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  select * into v_row from public.daily_reports where id = p_report_id;
  if not found or not public.parent_can_see(v_row.student_id) then
    raise exception 'Không tìm thấy nhận xét' using hint = 'NOT_FOUND';
  end if;
  if v_reply is not null and char_length(v_reply) > 500 then
    raise exception 'Lời nhắn tối đa 500 ký tự' using hint = 'VALIDATION:reply';
  end if;
  update public.daily_reports
     set parent_liked = coalesce(p_liked, parent_liked),
         parent_reply = coalesce(v_reply, parent_reply),
         parent_replied_at = case when v_reply is not null then now() else parent_replied_at end
   where id = p_report_id
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'parent_liked', v_row.parent_liked, 'parent_reply', v_row.parent_reply);
end;
$$;

create or replace function public.parent_attendance_request(p_student_id uuid, p_type text, p_date date, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_parent uuid := public.current_parent_id();
  v_today  date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_id     uuid;
begin
  if v_parent is null or not public.parent_can_see(p_student_id) then
    raise exception 'Không có quyền gửi yêu cầu cho học viên này' using hint = 'FORBIDDEN';
  end if;
  if p_type not in ('LEAVE', 'MAKEUP') then
    raise exception 'Loại yêu cầu không hợp lệ' using hint = 'VALIDATION:type';
  end if;
  if p_date is null or p_date < v_today or p_date > v_today + 60 then
    raise exception 'Chọn ngày từ hôm nay đến 60 ngày tới' using hint = 'VALIDATION:date';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'Lý do cần 3–300 ký tự' using hint = 'VALIDATION:reason';
  end if;
  begin
    insert into public.attendance_requests (student_id, parent_id, type, requested_date, reason)
    values (p_student_id, v_parent, p_type, p_date, btrim(p_reason)) returning id into v_id;
  exception when unique_violation then
    raise exception 'Đã có yêu cầu cho ngày này' using hint = 'CONFLICT';
  end;
  return jsonb_build_object('id', v_id, 'status', 'PENDING');
end;
$$;

-- ─── Teachers: write the contact book ───────────────────────────────────────
-- PRESENT uses one session from the course balance (if the course tracks sessions).
create or replace function public.daily_report_create(
  p_enrollment_id uuid, p_session_date date, p_attendance text, p_feedback text, p_media jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_e       public.enrollments;
  v_teacher text;
  v_id      uuid;
  v_media   jsonb := coalesce(p_media, '[]'::jsonb);
  v_today   date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  m         text;
begin
  if not public.is_staff() then
    raise exception 'Chỉ giáo viên / nhân viên TH EDU được ghi sổ liên lạc' using hint = 'FORBIDDEN';
  end if;
  select * into v_e from public.enrollments where id = p_enrollment_id for update;
  if not found then
    raise exception 'Không tìm thấy khóa học của học viên' using hint = 'NOT_FOUND';
  end if;
  if v_e.student_id is null then
    raise exception 'Học viên chưa được liên kết tài khoản phụ huynh — quản trị viên liên kết trước' using hint = 'CONFLICT';
  end if;
  if p_attendance not in ('PRESENT', 'ABSENT', 'EXCUSED') then
    raise exception 'Trạng thái điểm danh không hợp lệ' using hint = 'VALIDATION:attendance';
  end if;
  if p_session_date is null or p_session_date > v_today or p_session_date < v_today - 30 then
    raise exception 'Ngày học trong vòng 30 ngày qua' using hint = 'VALIDATION:session_date';
  end if;
  if p_feedback is not null and char_length(p_feedback) > 2000 then
    raise exception 'Nhận xét tối đa 2000 ký tự' using hint = 'VALIDATION:feedback';
  end if;
  if jsonb_typeof(v_media) <> 'array' or jsonb_array_length(v_media) > 6 then
    raise exception 'Tối đa 6 ảnh' using hint = 'VALIDATION:media';
  end if;
  for m in select jsonb_array_elements_text(v_media) loop
    if split_part(m, '/', 1) <> v_e.student_id::text then
      raise exception 'Ảnh không thuộc học viên này' using hint = 'VALIDATION:media';
    end if;
  end loop;

  select coalesce(nullif(btrim(raw_user_meta_data ->> 'full_name'), ''), split_part(email, '@', 1))
    into v_teacher from auth.users where id = auth.uid();

  begin
    insert into public.daily_reports (student_id, enrollment_id, course_code, session_date, attendance, teacher_name,
                                      feedback_text, media_urls, created_by)
    values (v_e.student_id, v_e.id, v_e.course_code, p_session_date, p_attendance, left(coalesce(v_teacher, 'Giáo viên'), 60),
            nullif(btrim(coalesce(p_feedback, '')), ''), v_media, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Buổi học ngày này đã được ghi sổ' using hint = 'CONFLICT';
  end;

  if p_attendance = 'PRESENT' and v_e.sessions_remaining is not null then
    update public.enrollments set sessions_remaining = greatest(sessions_remaining - 1, 0) where id = v_e.id
    returning * into v_e;
  end if;
  return jsonb_build_object('id', v_id, 'sessions_remaining', v_e.sessions_remaining);
end;
$$;

-- ─── Admin: accounts, students, sessions, requests ──────────────────────────

-- p_status: ALL | ACTIVE (active course, ≥ 3 sessions or untracked) | EXPIRING (< 3 sessions left)
--           | GUEST (no active course) | LOCKED (account disabled)
create or replace function public.admin_parents(p_search text default null, p_campus text default null, p_status text default 'ALL', p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được quản lý tài khoản phụ huynh' using hint = 'FORBIDDEN';
  end if;
  return coalesce((
    select jsonb_agg(row_json order by created_at desc)
    from (
      select u.created_at,
        jsonb_build_object(
          'id', u.id, 'phone', u.phone, 'full_name', u.full_name, 'is_active', u.is_active,
          'referral_code', u.referral_code, 'last_login_at', u.last_login_at, 'created_at', u.created_at,
          'self_registered', u.created_by is null,
          'status', st.status,
          'pending_requests', (select count(*) from public.attendance_requests a join public.parent_student_links l2 on l2.student_id = a.student_id
                                where l2.parent_id = u.id and a.status = 'PENDING'),
          'students', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', s.id, 'full_name', s.full_name, 'birth_year', s.birth_year, 'campus_location', s.campus_location,
              'relationship', l.relationship,
              'enrollments', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', e.id, 'course_code', e.course_code, 'level', e.level, 'status', e.status,
                  'sessions_total', e.sessions_total, 'sessions_remaining', e.sessions_remaining, 'schedule', e.schedule)
                  order by e.start_date desc)
                from public.enrollments e where e.student_id = s.id and e.status = 'ACTIVE'), '[]'::jsonb))
              order by l.is_primary desc, s.created_at)
            from public.parent_student_links l join public.students s on s.id = l.student_id
            where l.parent_id = u.id), '[]'::jsonb)) as row_json
      from public.users u
      cross join lateral (
        select case
          when not u.is_active then 'LOCKED'
          when not exists (select 1 from public.parent_student_links l join public.enrollments e on e.student_id = l.student_id
                            where l.parent_id = u.id and e.status = 'ACTIVE') then 'GUEST'
          when exists (select 1 from public.parent_student_links l join public.enrollments e on e.student_id = l.student_id
                        where l.parent_id = u.id and e.status = 'ACTIVE' and e.sessions_remaining is not null and e.sessions_remaining < 3) then 'EXPIRING'
          else 'ACTIVE' end as status
      ) st
      where u.role = 'PARENT'
        and (coalesce(p_status, 'ALL') = 'ALL' or st.status = p_status)
        and (p_campus is null or exists (select 1 from public.parent_student_links l join public.students s on s.id = l.student_id
                                           where l.parent_id = u.id and s.campus_location = p_campus))
        and (v_q is null or lower(u.full_name) like '%' || v_q || '%' or u.phone like '%' || regexp_replace(v_q, '\D', '', 'g') || '%'
             and regexp_replace(v_q, '\D', '', 'g') <> ''
             or exists (select 1 from public.parent_student_links l join public.students s on s.id = l.student_id
                         where l.parent_id = u.id and lower(s.full_name) like '%' || v_q || '%'))
      order by u.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 300)
    ) x), '[]'::jsonb);
end;
$$;

-- Create a parent (or add children to an existing phone) and auto-link students + courses.
-- p: {"phone", "full_name", "relationship", "children": [{"full_name", "birth_year", "campus_location",
--      "courses": [{"course_code", "level", "sessions_total", "schedule": [{"d", "start", "end"}]}]}]}
create or replace function public.admin_parent_create(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phone   text := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  v_name    text := btrim(coalesce(p ->> 'full_name', ''));
  v_rel     text := coalesce(nullif(p ->> 'relationship', ''), 'OTHER');
  v_user    public.users;
  v_created boolean := false;
  v_child   jsonb;
  v_course  jsonb;
  v_student uuid;
  v_total   int;
  v_n       int := 0;
  v_c       int := 0;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được tạo tài khoản phụ huynh' using hint = 'FORBIDDEN';
  end if;
  if v_phone ~ '^84[35789][0-9]{8}$' then v_phone := '0' || substr(v_phone, 3); end if;
  if v_phone !~ '^0[35789][0-9]{8}$' then
    raise exception 'Số điện thoại không hợp lệ' using hint = 'VALIDATION:phone';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'Tên phụ huynh cần 2–60 ký tự' using hint = 'VALIDATION:full_name';
  end if;
  if v_rel not in ('MOM', 'DAD', 'OTHER') then v_rel := 'OTHER'; end if;
  if jsonb_typeof(coalesce(p -> 'children', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p -> 'children', '[]'::jsonb)) > 6 then
    raise exception 'Tối đa 6 học viên mỗi lần' using hint = 'VALIDATION:children';
  end if;

  select * into v_user from public.users where phone = v_phone for update;
  if not found then
    insert into public.users (phone, full_name, role, created_by) values (v_phone, v_name, 'PARENT', auth.uid())
    returning * into v_user;
    v_created := true;
  elsif v_user.role <> 'PARENT' then
    raise exception 'Số điện thoại này thuộc tài khoản không phải phụ huynh' using hint = 'CONFLICT';
  end if;

  for v_child in select * from jsonb_array_elements(coalesce(p -> 'children', '[]'::jsonb)) loop
    if char_length(btrim(coalesce(v_child ->> 'full_name', ''))) not between 2 and 60 then
      raise exception 'Tên học viên cần 2–60 ký tự' using hint = 'VALIDATION:children';
    end if;
    if not exists (select 1 from public.branches where code = v_child ->> 'campus_location') then
      raise exception 'Chọn cơ sở cho học viên %', v_child ->> 'full_name' using hint = 'VALIDATION:campus_location';
    end if;
    insert into public.students (full_name, birth_year, campus_location, created_by)
    values (btrim(v_child ->> 'full_name'), nullif(v_child ->> 'birth_year', '')::smallint, v_child ->> 'campus_location', auth.uid())
    returning id into v_student;
    insert into public.parent_student_links (parent_id, student_id, relationship, is_primary)
    values (v_user.id, v_student, v_rel, not exists (select 1 from public.parent_student_links where parent_id = v_user.id));
    v_n := v_n + 1;

    for v_course in select * from jsonb_array_elements(coalesce(v_child -> 'courses', '[]'::jsonb)) loop
      if not exists (select 1 from public.categories where code = v_course ->> 'course_code') then
        raise exception 'Khóa học không hợp lệ' using hint = 'VALIDATION:course_code';
      end if;
      v_total := nullif(v_course ->> 'sessions_total', '')::int;
      if v_total is not null and v_total not between 1 and 500 then
        raise exception 'Số buổi học 1–500' using hint = 'VALIDATION:sessions_total';
      end if;
      insert into public.enrollments (student_id, student_name, course_code, level, campus_location, status,
                                      sessions_total, sessions_remaining, schedule)
      values (v_student, btrim(v_child ->> 'full_name'), v_course ->> 'course_code',
              greatest(1, least(5, coalesce(nullif(v_course ->> 'level', '')::int, 1))), v_child ->> 'campus_location', 'ACTIVE',
              v_total, v_total, case when jsonb_typeof(v_course -> 'schedule') = 'array' then v_course -> 'schedule' end);
      v_c := v_c + 1;
    end loop;
  end loop;

  return jsonb_build_object('parent_id', v_user.id, 'created', v_created, 'students', v_n, 'courses', v_c);
end;
$$;

create or replace function public.admin_parent_set_active(p_parent_id uuid, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được khóa / mở tài khoản' using hint = 'FORBIDDEN';
  end if;
  update public.users set is_active = coalesce(p_active, is_active) where id = p_parent_id and role = 'PARENT';
  if not found then
    raise exception 'Không tìm thấy tài khoản' using hint = 'NOT_FOUND';
  end if;
end;
$$;

create or replace function public.admin_enrollment_adjust_sessions(p_enrollment_id uuid, p_delta int, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_e public.enrollments;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được điều chỉnh số buổi' using hint = 'FORBIDDEN';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 200 then
    raise exception 'Số buổi điều chỉnh không hợp lệ' using hint = 'VALIDATION:delta';
  end if;
  update public.enrollments
     set sessions_remaining = least(500, greatest(coalesce(sessions_remaining, 0) + p_delta, 0)),
         sessions_total = least(500, greatest(coalesce(sessions_total, 0), coalesce(sessions_total, 0) + greatest(p_delta, 0),
                                       greatest(coalesce(sessions_remaining, 0) + p_delta, 0))),
         advisor_note = case when nullif(btrim(coalesce(p_note, '')), '') is null then advisor_note
                             else left(concat_ws(E'\n', nullif(advisor_note, ''),
                                  format('[%s] %s buổi: %s', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM'),
                                         case when p_delta > 0 then '+' || p_delta else p_delta::text end, btrim(p_note))), 500) end
   where id = p_enrollment_id
  returning * into v_e;
  if not found then
    raise exception 'Không tìm thấy khóa học' using hint = 'NOT_FOUND';
  end if;
  return jsonb_build_object('id', v_e.id, 'sessions_total', v_e.sessions_total, 'sessions_remaining', v_e.sessions_remaining);
end;
$$;

create or replace function public.admin_attendance_requests(p_status text default 'PENDING')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được duyệt yêu cầu' using hint = 'FORBIDDEN';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'type', a.type, 'requested_date', a.requested_date, 'reason', a.reason, 'status', a.status,
      'decision_note', a.decision_note, 'created_at', a.created_at,
      'student_id', s.id, 'student_name', s.full_name, 'campus_location', s.campus_location,
      'parent_name', u.full_name, 'parent_phone', u.phone) order by a.requested_date, a.created_at)
    from public.attendance_requests a
    join public.students s on s.id = a.student_id
    left join public.users u on u.id = a.parent_id
    where coalesce(p_status, 'PENDING') = 'ALL' or a.status = p_status), '[]'::jsonb);
end;
$$;

create or replace function public.admin_attendance_decide(p_request_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.attendance_requests;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được duyệt yêu cầu' using hint = 'FORBIDDEN';
  end if;
  if p_note is not null and char_length(p_note) > 300 then
    raise exception 'Ghi chú tối đa 300 ký tự' using hint = 'VALIDATION:note';
  end if;
  update public.attendance_requests
     set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_request_id and status = 'PENDING'
  returning * into v_row;
  if not found then
    raise exception 'Yêu cầu không còn chờ duyệt' using hint = 'CONFLICT';
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.current_parent_id() from public, anon;
revoke all on function public.parent_can_see(uuid) from public, anon;
grant execute on function public.current_parent_id() to authenticated;
grant execute on function public.parent_can_see(uuid) to authenticated;

revoke all on function public.otp_issue(text, text, text) from public, anon, authenticated;
revoke all on function public.otp_check(text, text, text) from public, anon, authenticated;
revoke all on function public.parent_signup(text, text, text, text, smallint, text, text) from public, anon, authenticated;
revoke all on function public.parent_auth_context(uuid) from public, anon, authenticated;
revoke all on function public.parent_attach_auth(uuid, uuid) from public, anon, authenticated;
grant execute on function public.otp_issue(text, text, text) to service_role;
grant execute on function public.otp_check(text, text, text) to service_role;
grant execute on function public.parent_signup(text, text, text, text, smallint, text, text) to service_role;
grant execute on function public.parent_auth_context(uuid) to service_role;
grant execute on function public.parent_attach_auth(uuid, uuid) to service_role;

revoke all on function public.parent_portal() from public, anon;
revoke all on function public.parent_reports(uuid, date, int) from public, anon;
revoke all on function public.parent_report_react(uuid, boolean, text) from public, anon;
revoke all on function public.parent_attendance_request(uuid, text, date, text) from public, anon;
revoke all on function public.daily_report_create(uuid, date, text, text, jsonb) from public, anon;
grant execute on function public.parent_portal() to authenticated;
grant execute on function public.parent_reports(uuid, date, int) to authenticated;
grant execute on function public.parent_report_react(uuid, boolean, text) to authenticated;
grant execute on function public.parent_attendance_request(uuid, text, date, text) to authenticated;
grant execute on function public.daily_report_create(uuid, date, text, text, jsonb) to authenticated;

revoke all on function public.admin_parents(text, text, text, int) from public, anon;
revoke all on function public.admin_parent_create(jsonb) from public, anon;
revoke all on function public.admin_parent_set_active(uuid, boolean) from public, anon;
revoke all on function public.admin_enrollment_adjust_sessions(uuid, int, text) from public, anon;
revoke all on function public.admin_attendance_requests(text) from public, anon;
revoke all on function public.admin_attendance_decide(uuid, boolean, text) from public, anon;
grant execute on function public.admin_parents(text, text, text, int) to authenticated;
grant execute on function public.admin_parent_create(jsonb) to authenticated;
grant execute on function public.admin_parent_set_active(uuid, boolean) to authenticated;
grant execute on function public.admin_enrollment_adjust_sessions(uuid, int, text) to authenticated;
grant execute on function public.admin_attendance_requests(text) to authenticated;
grant execute on function public.admin_attendance_decide(uuid, boolean, text) to authenticated;
