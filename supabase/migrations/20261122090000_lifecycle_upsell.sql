-- ─────────────────────────────────────────────────────────────────────────────
-- Student lifecycle after a course: completion certificate → teacher review → alumni offer → advisor call.
--
--   enrollments            one course a child is taking (created automatically when a lead becomes ENROLLED)
--   lifecycle_automations  the 4 follow-up messages queued when a teacher completes the course
--
--   Stage            When (09:00 VN)        What
--   COMPLETION_CERT  T+0  (course end date) thank-you + link to the digital certificate
--   TEACHER_REVIEW   T+3                    teacher's qualitative review
--   ALUMNI_DISCOUNT  T+7                    alumni offer for the next course — ONLY if a real offer is configured
--   FINAL_CALL       T+14                   flag the family for an advisor call + gentle reminder (no fake scarcity)
--
-- "student" = the child on the lead (leads has the parent's phone + child's name); there is no separate
-- students table, so enrollments.lead_id plays the role of student_id.
-- Pending follow-ups stop automatically when the family enrols in another course, the course is marked
-- DROPPED, or an advisor records the call.
-- The daily 09:00 job (Edge Function `api` → /api/cron/lifecycle) sends what is due; see
-- supabase/sql/schedule_lifecycle_cron.sql.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.enrollments (
  id                    uuid primary key default gen_random_uuid(),
  lead_id               uuid references public.leads (id) on delete set null,
  student_name          text not null check (char_length(btrim(student_name)) between 2 and 60),
  course_code           text not null references public.categories (code) on update cascade,
  level                 smallint not null default 1 check (level between 1 and 5),
  campus_location       text not null references public.branches (code) on update cascade,
  start_date            date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  end_date              date,
  status                text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED', 'DROPPED')),
  teacher_note          text check (teacher_note is null or char_length(teacher_note) <= 1000),
  certificate_code      text unique,
  completed_at          timestamptz,
  completed_by          uuid references auth.users (id) on delete set null,
  advisor_priority      boolean not null default false,
  advisor_flagged_at    timestamptz,
  advisor_contacted_at  timestamptz,
  advisor_note          text check (advisor_note is null or char_length(advisor_note) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint enrollments_end_after_start check (end_date is null or end_date >= start_date),
  constraint enrollments_completed_fields check (status <> 'COMPLETED' or (end_date is not null and certificate_code is not null))
);

create index enrollments_lead_idx on public.enrollments (lead_id);
create index enrollments_status_idx on public.enrollments (status, end_date);
create index enrollments_priority_idx on public.enrollments (advisor_flagged_at) where advisor_priority;

create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute function public.set_updated_at();

create table public.lifecycle_automations (
  id                   uuid primary key default gen_random_uuid(),
  enrollment_id        uuid not null references public.enrollments (id) on delete cascade,
  stage                text not null check (stage in ('COMPLETION_CERT', 'TEACHER_REVIEW', 'ALUMNI_DISCOUNT', 'FINAL_CALL')),
  scheduled_at         timestamptz not null,
  -- SENDING = claimed by a running job; SKIPPED = could not / should not be sent (reason in error);
  -- CANCELLED = no longer relevant (re-enrolled, dropped, advisor already called).
  status               text not null default 'PENDING' check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED')),
  attempt              smallint not null default 0,
  channel              text check (channel is null or channel in ('ZNS', 'OA')),
  provider_message_id  text,
  error                text,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint lifecycle_once unique (enrollment_id, stage)
);

create index lifecycle_due_idx on public.lifecycle_automations (scheduled_at) where status in ('PENDING', 'FAILED');

create trigger lifecycle_set_updated_at
  before update on public.lifecycle_automations
  for each row execute function public.set_updated_at();

alter table public.enrollments enable row level security;
alter table public.lifecycle_automations enable row level security;
create policy "staff read enrollments" on public.enrollments for select to authenticated using (public.is_staff());
create policy "staff read lifecycle" on public.lifecycle_automations for select to authenticated using (public.is_staff());
-- Writes go through the functions below (validation + queue in one transaction).
revoke insert, update, delete on public.enrollments from anon, authenticated;
revoke insert, update, delete on public.lifecycle_automations from anon, authenticated;
revoke all on public.enrollments from anon;
revoke all on public.lifecycle_automations from anon;

-- ─── Lead ENROLLED → active enrollment ──────────────────────────────────────
create or replace function public.leads_create_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ENROLLED' and old.status is distinct from 'ENROLLED'
     and not exists (select 1 from public.enrollments e
                     where e.lead_id = new.id and e.course_code = new.course_code and e.status = 'ACTIVE') then
    insert into public.enrollments (lead_id, student_name, course_code, campus_location)
    values (new.id, btrim(new.student_name), new.course_code, new.branch_location);
  end if;
  return new;
end;
$$;

create trigger leads_create_enrollment
  after update of status on public.leads
  for each row execute function public.leads_create_enrollment();

-- A new course for the same family → stop the upsell follow-ups of earlier courses.
create or replace function public.enrollments_stop_followups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is not null and new.status = 'ACTIVE' then
    update public.lifecycle_automations a
       set status = 'CANCELLED', error = 'Gia đình đã đăng ký khóa tiếp theo'
      from public.enrollments e
     where a.enrollment_id = e.id and e.lead_id = new.lead_id and e.id <> new.id
       and a.status in ('PENDING', 'FAILED') and a.attempt < 3;
    update public.enrollments
       set advisor_priority = false
     where lead_id = new.lead_id and id <> new.id and advisor_priority;
  end if;
  return new;
end;
$$;

create trigger enrollments_stop_followups
  after insert on public.enrollments
  for each row execute function public.enrollments_stop_followups();

-- ─── Staff actions ──────────────────────────────────────────────────────────

-- Complete a course: certificate + the 4 follow-ups, in one transaction.
create or replace function public.enrollment_complete(
  p_enrollment_id uuid,
  p_teacher_note  text,
  p_end_date      date default null,
  p_level         smallint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_end   date := coalesce(p_end_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  v_note  text := btrim(coalesce(p_teacher_note, ''));
  v_row   public.enrollments;
  v_base  timestamptz;
  v_code  text;
begin
  if not public.is_staff() then
    raise exception 'Chỉ giáo viên / nhân viên TH EDU được thực hiện thao tác này' using hint = 'FORBIDDEN';
  end if;
  if char_length(v_note) < 20 or char_length(v_note) > 1000 then
    raise exception 'Nhận xét cuối khóa cần 20–1000 ký tự' using hint = 'VALIDATION:teacher_note';
  end if;
  if p_level is not null and p_level not between 1 and 5 then
    raise exception 'Cấp độ không hợp lệ' using hint = 'VALIDATION:level';
  end if;

  select * into v_row from public.enrollments where id = p_enrollment_id for update;
  if not found then
    raise exception 'Không tìm thấy khóa học của học viên' using hint = 'NOT_FOUND';
  end if;
  if v_row.status <> 'ACTIVE' then
    raise exception 'Khóa học này đã hoàn thành hoặc đã dừng' using hint = 'CONFLICT';
  end if;
  if v_end < v_row.start_date or v_end > v_today + 30 then
    raise exception 'Ngày kết thúc phải sau ngày bắt đầu và không quá 30 ngày tới' using hint = 'VALIDATION:end_date';
  end if;

  v_code := 'THEDU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  update public.enrollments
     set status = 'COMPLETED',
         end_date = v_end,
         level = coalesce(p_level, level),
         teacher_note = v_note,
         certificate_code = v_code,
         completed_at = now(),
         completed_by = auth.uid()
   where id = p_enrollment_id
  returning * into v_row;

  -- 09:00 Vietnam time on the end date; if that is already past, the first message is due now.
  v_base := (v_end + time '09:00') at time zone 'Asia/Ho_Chi_Minh';
  insert into public.lifecycle_automations (enrollment_id, stage, scheduled_at) values
    (v_row.id, 'COMPLETION_CERT', greatest(v_base, now())),
    (v_row.id, 'TEACHER_REVIEW',  v_base + interval '3 days'),
    (v_row.id, 'ALUMNI_DISCOUNT', v_base + interval '7 days'),
    (v_row.id, 'FINAL_CALL',      v_base + interval '14 days');

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'certificate_code', v_row.certificate_code,
                            'end_date', v_row.end_date, 'level', v_row.level);
end;
$$;

create or replace function public.enrollment_drop(p_enrollment_id uuid, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.enrollments;
begin
  if not public.is_staff() then
    raise exception 'Chỉ giáo viên / nhân viên TH EDU được thực hiện thao tác này' using hint = 'FORBIDDEN';
  end if;
  update public.enrollments
     set status = 'DROPPED', advisor_priority = false,
         advisor_note = coalesce(nullif(left(btrim(coalesce(p_note, '')), 500), ''), advisor_note)
   where id = p_enrollment_id and status <> 'DROPPED'
  returning * into v_row;
  if not found then
    raise exception 'Không tìm thấy khóa học (hoặc đã dừng)' using hint = 'NOT_FOUND';
  end if;
  update public.lifecycle_automations set status = 'CANCELLED', error = 'Học viên dừng học'
   where enrollment_id = p_enrollment_id and status in ('PENDING', 'FAILED') and attempt < 3;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

-- Advisor called the family: clear the flag and stop remaining automated follow-ups.
create or replace function public.enrollment_mark_contacted(p_enrollment_id uuid, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.enrollments;
begin
  if not public.is_staff() then
    raise exception 'Chỉ giáo viên / nhân viên TH EDU được thực hiện thao tác này' using hint = 'FORBIDDEN';
  end if;
  update public.enrollments
     set advisor_priority = false, advisor_contacted_at = now(),
         advisor_note = coalesce(nullif(left(btrim(coalesce(p_note, '')), 500), ''), advisor_note)
   where id = p_enrollment_id and status = 'COMPLETED'
  returning * into v_row;
  if not found then
    raise exception 'Chỉ ghi nhận cuộc gọi cho học viên đã hoàn thành khóa' using hint = 'CONFLICT';
  end if;
  update public.lifecycle_automations set status = 'CANCELLED', error = 'Tư vấn viên đã gọi'
   where enrollment_id = p_enrollment_id and status in ('PENDING', 'FAILED') and attempt < 3;
  return jsonb_build_object('id', v_row.id, 'advisor_contacted_at', v_row.advisor_contacted_at);
end;
$$;

-- ─── Job functions (service role only) ──────────────────────────────────────

create or replace function public.lifecycle_due(p_now timestamptz default now(), p_limit int default 50, p_enrollment_id uuid default null)
returns table (automation_id uuid, enrollment_id uuid, stage text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.enrollment_id, a.stage
  from public.lifecycle_automations a
  join public.enrollments e on e.id = a.enrollment_id
  where a.status in ('PENDING', 'FAILED')
    and a.attempt < 3
    and a.scheduled_at <= p_now
    and e.status = 'COMPLETED'
    and (p_enrollment_id is null or a.enrollment_id = p_enrollment_id)
  order by a.scheduled_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Everything a message needs, in one call.
create or replace function public.lifecycle_context(p_automation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'automation_id', a.id,
    'stage', a.stage,
    'attempt', a.attempt,
    'enrollment', jsonb_build_object(
      'id', e.id, 'student_name', e.student_name, 'course_code', e.course_code, 'course_name', c.name,
      'level', e.level, 'start_date', e.start_date, 'end_date', e.end_date, 'teacher_note', e.teacher_note,
      'certificate_code', e.certificate_code, 'status', e.status),
    'family', case when l.id is null then null else jsonb_build_object(
      'lead_id', l.id, 'parent_name', l.parent_name, 'phone_number', l.phone_number, 'zalo_user_id', l.zalo_user_id) end,
    'branch', jsonb_build_object('code', b.code, 'name', b.name, 'address', b.address)
  )
  from public.lifecycle_automations a
  join public.enrollments e on e.id = a.enrollment_id
  join public.categories c on c.code = e.course_code
  join public.branches b on b.code = e.campus_location
  left join public.leads l on l.id = e.lead_id
  where a.id = p_automation_id;
$$;

-- Atomic claim: only one job run can send a given follow-up.
create or replace function public.lifecycle_claim(p_automation_id uuid, p_channel text)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  with c as (
    update public.lifecycle_automations
       set status = 'SENDING', attempt = attempt + 1, channel = p_channel
     where id = p_automation_id and status in ('PENDING', 'FAILED') and attempt < 3
    returning 1
  )
  select exists (select 1 from c);
$$;

create or replace function public.lifecycle_finish(p_automation_id uuid, p_status text, p_provider_id text default null, p_error text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_status not in ('SENT', 'FAILED', 'SKIPPED') then
    raise exception 'invalid status %', p_status;
  end if;
  update public.lifecycle_automations
     set status = p_status,
         provider_message_id = p_provider_id,
         error = left(p_error, 500),
         sent_at = case when p_status = 'SENT' then now() else sent_at end
   where id = p_automation_id;
end;
$$;

-- T+14: put the family on the advisor's call list (and note it on the lead for the CRM).
create or replace function public.lifecycle_flag_advisor(p_enrollment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.enrollments;
begin
  update public.enrollments
     set advisor_priority = true, advisor_flagged_at = coalesce(advisor_flagged_at, now())
   where id = p_enrollment_id and status = 'COMPLETED' and advisor_contacted_at is null
  returning * into v_row;
  if found and v_row.lead_id is not null then
    update public.leads
       set staff_note = left(concat_ws(E'\n', nullif(staff_note, ''),
             format('[%s] Ưu tiên gọi tư vấn khóa tiếp theo (14 ngày sau khi hoàn thành %s)',
                    to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM'), v_row.course_code)), 1000)
     where id = v_row.lead_id;
  end if;
end;
$$;

-- ─── Public certificate (by its unguessable code) ───────────────────────────
create or replace function public.get_certificate(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'code', e.certificate_code, 'student_name', e.student_name, 'course_code', e.course_code, 'course_name', c.name,
    'level', e.level, 'start_date', e.start_date, 'end_date', e.end_date, 'branch_name', b.name)
  from public.enrollments e
  join public.categories c on c.code = e.course_code
  join public.branches b on b.code = e.campus_location
  where e.certificate_code = upper(btrim(p_code)) and e.status = 'COMPLETED';
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.leads_create_enrollment() from public, anon, authenticated;
revoke all on function public.enrollments_stop_followups() from public, anon, authenticated;
revoke all on function public.enrollment_complete(uuid, text, date, smallint) from public, anon;
revoke all on function public.enrollment_drop(uuid, text) from public, anon;
revoke all on function public.enrollment_mark_contacted(uuid, text) from public, anon;
grant execute on function public.enrollment_complete(uuid, text, date, smallint) to authenticated;
grant execute on function public.enrollment_drop(uuid, text) to authenticated;
grant execute on function public.enrollment_mark_contacted(uuid, text) to authenticated;

revoke all on function public.lifecycle_due(timestamptz, int, uuid) from public, anon, authenticated;
revoke all on function public.lifecycle_context(uuid) from public, anon, authenticated;
revoke all on function public.lifecycle_claim(uuid, text) from public, anon, authenticated;
revoke all on function public.lifecycle_finish(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.lifecycle_flag_advisor(uuid) from public, anon, authenticated;
grant execute on function public.lifecycle_due(timestamptz, int, uuid) to service_role;
grant execute on function public.lifecycle_context(uuid) to service_role;
grant execute on function public.lifecycle_claim(uuid, text) to service_role;
grant execute on function public.lifecycle_finish(uuid, text, text, text) to service_role;
grant execute on function public.lifecycle_flag_advisor(uuid) to service_role;

revoke all on function public.get_certificate(text) from public;
grant execute on function public.get_certificate(text) to anon, authenticated;
