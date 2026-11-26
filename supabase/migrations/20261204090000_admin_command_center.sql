-- ═══════════════════════════════════════════════════════════════════════════
-- Admin Command Center: the numbers and queues the owner needs on one screen.
--
--   ad_spend                         monthly ad spend per channel (+ branch) → CPA
--   admin_ad_spend_save(...)         upsert one month / channel / branch
--   admin_command_overview(b, days)  tuition collected vs unpaid, trial attendance, revenue per course,
--                                    spend + CPA per channel, recent invoices, ops queues
--   admin_class_report_status(b, d)  classes meeting on a day vs sổ liên lạc / điểm danh already sent
--   admin_recent_comments(...)       EduFeed comments across all videos (moderation)
--   admin_system_health()            push outbox, device tokens, weekly digest, Zalo OA token
--
-- Everything is read-only except ad_spend; every function is admin-only (is_admin()).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.ad_spend (
  id           uuid primary key default gen_random_uuid(),
  -- '' = both campuses (unique key needs a value; exposed as null).
  branch_key   text not null default '' check (branch_key = '' or branch_key in ('XA_LA', 'NGO_THI_NHAM')),
  channel      text not null check (channel in ('FACEBOOK', 'TIKTOK', 'ZALO', 'REFERRAL', 'OTHER')),
  month_start  date not null check (extract(day from month_start) = 1),
  amount_vnd   bigint not null check (amount_vnd between 0 and 10000000000),
  note         text check (note is null or char_length(note) <= 200),
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (branch_key, channel, month_start)
);
alter table public.ad_spend enable row level security;
revoke all on public.ad_spend from anon, authenticated;

create or replace function public.admin_guard()
returns void
language plpgsql
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên' using hint = 'FORBIDDEN';
  end if;
end $$;

create or replace function public.admin_branch_check(p_branch text)
returns void
language plpgsql
stable
as $$
begin
  if p_branch is not null and p_branch not in ('XA_LA', 'NGO_THI_NHAM') then
    raise exception 'Cơ sở không tồn tại' using hint = 'VALIDATION:branch';
  end if;
end $$;

-- ─── Ad spend ───────────────────────────────────────────────────────────────

create or replace function public.admin_ad_spend_save(p_branch text, p_channel text, p_month date, p_amount_vnd bigint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  perform public.admin_branch_check(p_branch);
  if p_channel not in ('FACEBOOK', 'TIKTOK', 'ZALO', 'REFERRAL', 'OTHER') then
    raise exception 'Kênh không hợp lệ' using hint = 'VALIDATION:channel';
  end if;
  if p_month is null then
    raise exception 'Chọn tháng' using hint = 'VALIDATION:month';
  end if;
  if p_amount_vnd is null or p_amount_vnd < 0 or p_amount_vnd > 10000000000 then
    raise exception 'Số tiền không hợp lệ' using hint = 'VALIDATION:amount';
  end if;
  insert into public.ad_spend (branch_key, channel, month_start, amount_vnd, note, updated_by)
  values (coalesce(p_branch, ''), p_channel, date_trunc('month', p_month)::date, p_amount_vnd, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (branch_key, channel, month_start) do update
    set amount_vnd = excluded.amount_vnd, note = excluded.note, updated_by = auth.uid(), updated_at = now();
end $$;
grant execute on function public.admin_ad_spend_save(text, text, date, bigint, text) to authenticated;

-- ─── Overview ───────────────────────────────────────────────────────────────

create or replace function public.admin_command_overview(p_branch text default null, p_days int default 30, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days  int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (p_now at time zone 'Asia/Ho_Chi_Minh')::date;
  -- "Hôm nay" (1 day) = since local midnight; N days = the last N local days including today.
  v_from  timestamptz := ((v_today - (v_days - 1)) :: timestamp) at time zone 'Asia/Ho_Chi_Minh';
  v_from_d date := v_today - (v_days - 1);
  v_out   jsonb;
begin
  perform public.admin_guard();
  perform public.admin_branch_check(p_branch);

  with
  l as (select * from public.leads where (p_branch is null or branch_location = p_branch) and created_at >= v_from and created_at <= p_now),
  trials as (
    -- Trials whose appointment fell in the period (up to now): did the child come?
    select * from public.leads
     where (p_branch is null or branch_location = p_branch)
       and appointment_time >= v_from and appointment_time <= p_now
       and status <> 'CANCELLED'
  ),
  inv as (select * from public.tuition_invoices where p_branch is null or campus_location = p_branch),
  paid as (select * from inv where status = 'PAID' and paid_at >= v_from and paid_at <= p_now),
  spend as (
    select channel, sum(amount_vnd)::bigint amount
      from public.ad_spend
     where (p_branch is null or branch_key in ('', p_branch))
       and month_start >= date_trunc('month', v_from_d)::date and month_start <= v_today
     group by channel
  ),
  ch as (
    select c.channel,
           (select count(*) from l where l.channel = c.channel) leads,
           (select count(*) from l where l.channel = c.channel and l.status = 'ENROLLED') enrolled,
           coalesce((select amount from spend s where s.channel = c.channel), 0) spend
      from (values ('FACEBOOK'), ('TIKTOK'), ('ZALO'), ('REFERRAL'), ('OTHER'), ('UNTRACKED')) as c(channel)
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', p_now, 'days', v_days),
    'leads', jsonb_build_object(
      'total', (select count(*) from l),
      'enrolled', (select count(*) from l where status = 'ENROLLED'),
      'cancelled', (select count(*) from l where status = 'CANCELLED')),
    'trials', jsonb_build_object(
      'scheduled', (select count(*) from trials),
      'attended', (select count(*) from trials where trial_completed_at is not null or status in ('COMPLETED_TRIAL', 'ENROLLED'))),
    'tuition', jsonb_build_object(
      'collectedVnd', coalesce((select sum(coalesce(paid_amount_vnd, amount_vnd)) from paid), 0),
      'paidCount', (select count(*) from paid),
      'unpaidVnd', coalesce((select sum(amount_vnd) from inv where status = 'PENDING_PAYMENT'), 0),
      'unpaidCount', (select count(*) from inv where status = 'PENDING_PAYMENT')),
    'revenueByCourse', coalesce((
      select jsonb_agg(jsonb_build_object('course', course_code, 'amountVnd', amt, 'count', n) order by amt desc)
        from (select course_code, sum(coalesce(paid_amount_vnd, amount_vnd)) amt, count(*) n from paid group by course_code) x), '[]'::jsonb),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('channel', channel, 'leads', leads, 'enrolled', enrolled, 'spendVnd', spend,
                                          'cpaVnd', case when leads > 0 and spend > 0 then round(spend::numeric / leads) end))
        from ch where leads > 0 or spend > 0), '[]'::jsonb),
    'spendVnd', coalesce((select sum(amount) from spend), 0),
    'recentInvoices', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
        from (select id, ref, student_name "studentName", course_code "course", campus_location "campus", amount_vnd "amountVnd",
                     status, method, receipt_no "receiptNo", created_at "createdAt", paid_at "paidAt"
                from inv order by (status = 'PENDING_PAYMENT') desc, coalesce(paid_at, created_at) desc limit 20) x), '[]'::jsonb),
    'queues', jsonb_build_object(
      'attendanceRequests', (select count(*) from public.attendance_requests r join public.students s on s.id = r.student_id
                              where r.status = 'PENDING' and (p_branch is null or s.campus_location = p_branch)),
      'newLeads', (select count(*) from public.leads where status = 'NEW' and (p_branch is null or branch_location = p_branch)),
      'commentsToday', (select count(*) from public.video_comments where created_at >= (v_today::timestamp at time zone 'Asia/Ho_Chi_Minh') and not is_hidden),
      'deletionRequests', (select count(*) from public.account_deletion_requests where status = 'PENDING'),
      'openTasks', (select count(*) from public.staff_tasks where status in ('PENDING', 'IN_PROGRESS')))
  ) into v_out;
  return v_out;
end $$;
grant execute on function public.admin_command_overview(text, int, timestamptz) to authenticated;

-- ─── Classes vs today's contact book ────────────────────────────────────────

create or replace function public.admin_class_report_status(p_branch text default null, p_date date default null)
returns table (class_id uuid, class_name text, course_code text, campus text, teacher_name text, slot text,
               students int, attended int, reports int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  v_d int := extract(isodow from v_date)::int + 1;   -- schedule uses 2 (Thứ 2) … 8 (Chủ nhật)
begin
  perform public.admin_guard();
  perform public.admin_branch_check(p_branch);
  return query
    select c.id, c.name, c.course_code, c.campus_location,
           coalesce(sp.display_name, split_part(coalesce(u.email, ''), '@', 1), 'Chưa phân công'),
           (select string_agg((s ->> 'start') || '–' || (s ->> 'end'), ', ') from jsonb_array_elements(c.schedule) s where (s ->> 'd')::int = v_d),
           (select count(*)::int from public.class_members m where m.class_id = c.id),
           (select count(*)::int from public.attendance_logs a where a.class_id = c.id and a.session_date = v_date and a.status in ('PRESENT', 'LATE')),
           (select count(*)::int from public.class_members m join public.daily_reports d on d.enrollment_id = m.enrollment_id
             where m.class_id = c.id and d.session_date = v_date)
      from public.classes c
      left join public.staff_profiles sp on sp.user_id = c.teacher_id
      left join auth.users u on u.id = c.teacher_id
     where c.is_active
       and (p_branch is null or c.campus_location = p_branch)
       and exists (select 1 from jsonb_array_elements(c.schedule) s where (s ->> 'd')::int = v_d)
     order by 6 nulls last, c.name;
end $$;
grant execute on function public.admin_class_report_status(text, date) to authenticated;

-- ─── Comments (moderation) ──────────────────────────────────────────────────

create or replace function public.admin_recent_comments(p_filter text default 'ALL', p_limit int default 50)
returns table (id uuid, video_id uuid, video_title text, author_name text, author_role text, content text,
               is_hidden boolean, is_reply boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  if coalesce(p_filter, 'ALL') not in ('ALL', 'VISIBLE', 'HIDDEN', 'QUESTIONS') then
    raise exception 'Bộ lọc không hợp lệ' using hint = 'VALIDATION:filter';
  end if;
  return query
    select c.id, c.video_id, v.title, c.author_name, c.author_role, c.content, c.is_hidden, c.parent_comment_id is not null, c.created_at
      from public.video_comments c
      join public.videos v on v.id = c.video_id
     where case coalesce(p_filter, 'ALL')
             when 'VISIBLE' then not c.is_hidden
             when 'HIDDEN' then c.is_hidden
             -- Parent / guest questions nobody from the centre has answered yet.
             when 'QUESTIONS' then not c.is_hidden and c.parent_comment_id is null and c.author_role in ('PARENT', 'GUEST')
                                   and not exists (select 1 from public.video_comments r where r.parent_comment_id = c.id and r.author_role in ('TEACHER', 'ADMIN'))
             else true end
     order by c.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
grant execute on function public.admin_recent_comments(text, int) to authenticated;

-- ─── System health ──────────────────────────────────────────────────────────

create or replace function public.admin_system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week date := public.week_monday(public.vn_today()) - 7;
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'push', jsonb_build_object(
      'pending', (select count(*) from public.push_outbox where status in ('PENDING', 'PROCESSING')),
      'failed24h', (select count(*) from public.push_outbox where status = 'FAILED' and created_at >= now() - interval '24 hours'),
      'sent24h', (select count(*) from public.push_outbox where status = 'SENT' and created_at >= now() - interval '24 hours'),
      'oldestPendingAt', (select min(created_at) from public.push_outbox where status in ('PENDING', 'PROCESSING')),
      'devices', (select count(*) from public.device_push_tokens)),
    'weeklyDigest', jsonb_build_object(
      'weekStart', v_week,
      'published', (select count(*) from public.weekly_progress_reports where week_start_date = v_week and published_at is not null),
      'zaloSent', (select count(*) from public.weekly_progress_reports where week_start_date = v_week and zalo_notified_at is not null),
      'drafts', (select count(*) from public.weekly_progress_reports where week_start_date = v_week and published_at is null)),
    'zalo', jsonb_build_object(
      'connected', exists (select 1 from public.zalo_oa_tokens),
      'expiresAt', (select max(access_expires_at) from public.zalo_oa_tokens),
      'lastError', (select last_error from public.zalo_oa_tokens limit 1),
      'lastErrorAt', (select last_error_at from public.zalo_oa_tokens limit 1)),
    'release', coalesce((select jsonb_agg(jsonb_build_object('platform', platform, 'min', min_supported_version, 'latest', latest_version,
                                                             'force', is_force_update, 'updatedAt', updated_at) order by platform)
                           from public.app_release_config), '[]'::jsonb)
  );
end $$;
grant execute on function public.admin_system_health() to authenticated;
