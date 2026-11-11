-- ═══════════════════════════════════════════════════════════════════════════
-- CRM automation: lead lifecycle, appointment time, message log, reminder scheduling
--
--   leads.status        text: NEW → CONFIRMED → REMINDED_24H → REMINDED_2H → COMPLETED_TRIAL → ENROLLED
--                       (+ CONTACTED for manual follow-up, CANCELLED)
--   leads.appointment_time  computed from preferred_date + preferred_slot (Asia/Ho_Chi_Minh)
--   trial_slots         start time of each trial slot (source for appointment_time)
--   crm_logs            every parent message (ZNS / OA / SMS): one active row per (lead, kind) → no double sends
--   crm_due_messages()  which reminders are due now (called by the 15-minute cron)
--   crm_claim_message() / crm_finish_message()   atomic claim + result recording
--   crm_complete_trial() / crm_set_status()      staff actions (checked with is_staff())
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Trial slots (start times) ──────────────────────────────────────────────
-- Keep in sync with TIME_SLOTS in supabase/functions/_shared/contracts.ts.
create table public.trial_slots (
  id          text primary key,
  label       text not null,
  start_time  time not null,
  kind        text not null check (kind in ('WEEKDAY', 'WEEKEND'))
);

insert into public.trial_slots (id, label, start_time, kind) values
  ('wd-1730', '17:30 – 19:00', '17:30', 'WEEKDAY'),
  ('wd-1900', '19:00 – 20:30', '19:00', 'WEEKDAY'),
  ('we-0800', '08:00 – 09:30', '08:00', 'WEEKEND'),
  ('we-0945', '09:45 – 11:15', '09:45', 'WEEKEND'),
  ('we-1500', '15:00 – 16:30', '15:00', 'WEEKEND');

alter table public.trial_slots enable row level security;
create policy "public read trial slots" on public.trial_slots for select to anon, authenticated using (true);

-- ─── leads.status: enum → text with the full lifecycle ──────────────────────
-- (Column type changes are not allowed while a policy / index references the column.)
drop policy if exists "public insert leads" on public.leads;
drop index if exists public.leads_status_idx;

alter table public.leads alter column status drop default;
alter table public.leads alter column status type text using status::text;
alter table public.leads alter column status set default 'NEW';
alter table public.leads add constraint leads_status_check check (status in (
  'NEW', 'CONTACTED', 'CONFIRMED', 'REMINDED_24H', 'REMINDED_2H', 'COMPLETED_TRIAL', 'ENROLLED', 'CANCELLED'
));
drop type public.lead_status;

create index leads_status_idx on public.leads (status) where status not in ('ENROLLED', 'CANCELLED');

create policy "public insert leads"
  on public.leads for insert to anon, authenticated
  with check (
    status = 'NEW'
    and notified_at is null
    and notification_log is null
    and (preferred_date is null or preferred_date >= current_date)
  );

-- ─── leads: scheduling + trial outcome ──────────────────────────────────────
alter table public.leads
  add column appointment_time    timestamptz,
  add column teacher_note        text check (teacher_note is null or char_length(teacher_note) <= 1000),
  add column staff_note          text check (staff_note is null or char_length(staff_note) <= 1000),
  add column trial_completed_at  timestamptz,
  add column trial_completed_by  uuid references auth.users (id) on delete set null;

create index leads_appointment_idx on public.leads (appointment_time)
  where status in ('CONFIRMED', 'REMINDED_24H', 'REMINDED_2H', 'COMPLETED_TRIAL');

-- appointment_time = preferred_date + slot start, in Vietnam time.
create or replace function public.leads_set_appointment_time()
returns trigger
language plpgsql
as $$
begin
  if new.preferred_date is null or new.preferred_slot is null then
    new.appointment_time := null;
  else
    select (new.preferred_date + s.start_time) at time zone 'Asia/Ho_Chi_Minh'
      into new.appointment_time
    from public.trial_slots s
    where s.id = new.preferred_slot;
  end if;
  return new;
end;
$$;

create trigger leads_appointment_time
  before insert or update of preferred_date, preferred_slot on public.leads
  for each row execute function public.leads_set_appointment_time();

-- Backfill existing leads.
update public.leads set preferred_slot = preferred_slot where preferred_slot is not null;

-- ─── crm_logs ───────────────────────────────────────────────────────────────
create table public.crm_logs (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references public.leads (id) on delete cascade,
  kind                 text not null check (kind in ('CONFIRMATION', 'REMINDER_24H', 'REMINDER_2H', 'POST_TRIAL')),
  channel              text not null check (channel in ('ZNS', 'OA', 'SMS')),
  status               text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempt              smallint not null default 1,
  provider_message_id  text,
  error                text,
  -- What was sent (template id + params). Contains parent/child names → staff-only (RLS).
  payload              jsonb,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz
);

-- At most one in-flight or successful message per lead and kind → reminders are never sent twice,
-- even if two cron runs overlap. FAILED rows don't count, so a failed send can be retried.
create unique index crm_logs_one_active on public.crm_logs (lead_id, kind) where status in ('PENDING', 'SENT');
create index crm_logs_lead_idx on public.crm_logs (lead_id, created_at desc);

alter table public.crm_logs enable row level security;
create policy "staff read crm logs" on public.crm_logs for select to authenticated using (public.is_staff());
-- No insert/update policies: only the Edge Function (service role) writes logs.

-- ─── Due messages ───────────────────────────────────────────────────────────
-- Rules (p_now injectable for tests):
--   REMINDER_24H  CONFIRMED, appointment in (3h, 24h], booked ≥ 26h ahead (else the confirmation is enough)
--   REMINDER_2H   CONFIRMED or REMINDED_24H, appointment in (0, 2h]
--   POST_TRIAL    COMPLETED_TRIAL, ≥ 2h after the trial, completed within 3 days, 07:00–21:00 Vietnam time
-- Excludes kinds already PENDING/SENT/SKIPPED and kinds that failed 3 times.
create or replace function public.crm_due_messages(p_now timestamptz default now(), p_limit int default 50)
returns table (lead_id uuid, kind text, appointment_time timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select l.id, 'REMINDER_24H'::text as kind, l.appointment_time
    from public.leads l
    where l.status = 'CONFIRMED'
      and l.appointment_time > p_now + interval '3 hours'
      and l.appointment_time <= p_now + interval '24 hours'
      and l.appointment_time - l.created_at >= interval '26 hours'
    union all
    select l.id, 'REMINDER_2H', l.appointment_time
    from public.leads l
    where l.status in ('CONFIRMED', 'REMINDED_24H')
      and l.appointment_time > p_now
      and l.appointment_time <= p_now + interval '2 hours'
    union all
    select l.id, 'POST_TRIAL', l.appointment_time
    from public.leads l
    where l.status = 'COMPLETED_TRIAL'
      and coalesce(l.appointment_time + interval '2 hours', l.trial_completed_at) <= p_now
      and l.trial_completed_at > p_now - interval '3 days'
      and extract(hour from p_now at time zone 'Asia/Ho_Chi_Minh') between 7 and 20
  )
  select c.id, c.kind, c.appointment_time
  from candidates c
  where not exists (
          select 1 from public.crm_logs g
          where g.lead_id = c.id and g.kind = c.kind and g.status in ('PENDING', 'SENT', 'SKIPPED'))
    and (select count(*) from public.crm_logs g
         where g.lead_id = c.id and g.kind = c.kind and g.status = 'FAILED') < 3
  order by c.appointment_time nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- ─── Claim / finish (service role only) ─────────────────────────────────────
-- Claim: insert a PENDING log. Returns its id, or NULL if another run already claimed / sent it.
create or replace function public.crm_claim_message(p_lead_id uuid, p_kind text, p_channel text, p_payload jsonb default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_attempt int;
begin
  -- A run that crashed mid-send leaves PENDING behind: expire it so the message can be retried.
  update public.crm_logs
     set status = 'FAILED', error = coalesce(error, 'timeout: no result recorded')
   where lead_id = p_lead_id and kind = p_kind and status = 'PENDING'
     and created_at < now() - interval '10 minutes';

  select count(*) + 1 into v_attempt
  from public.crm_logs where lead_id = p_lead_id and kind = p_kind and status = 'FAILED';

  insert into public.crm_logs (lead_id, kind, channel, status, attempt, payload)
  values (p_lead_id, p_kind, p_channel, 'PENDING', v_attempt, p_payload)
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- Record a send attempt that was decided without claiming (e.g. not configured) → stops re-evaluation.
create or replace function public.crm_skip_message(p_lead_id uuid, p_kind text, p_reason text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.crm_logs (lead_id, kind, channel, status, error)
  select p_lead_id, p_kind, 'ZNS', 'SKIPPED', left(p_reason, 500)
  where not exists (select 1 from public.crm_logs
                    where lead_id = p_lead_id and kind = p_kind and status in ('PENDING', 'SENT', 'SKIPPED'));
$$;

-- Finish: record the result; on success advance the lead's status (only from the expected state,
-- so a lead cancelled in the meantime is never moved back).
create or replace function public.crm_finish_message(
  p_log_id uuid, p_status text, p_provider_id text default null, p_error text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lead uuid;
  v_kind text;
begin
  if p_status not in ('SENT', 'FAILED') then
    raise exception 'invalid status %', p_status;
  end if;

  update public.crm_logs
     set status = p_status,
         provider_message_id = p_provider_id,
         error = left(p_error, 500),
         sent_at = case when p_status = 'SENT' then now() end
   where id = p_log_id and status = 'PENDING'
  returning lead_id, kind into v_lead, v_kind;

  if p_status = 'SENT' and v_lead is not null then
    update public.leads
       set status = case v_kind
                      when 'CONFIRMATION' then 'CONFIRMED'
                      when 'REMINDER_24H' then 'REMINDED_24H'
                      when 'REMINDER_2H'  then 'REMINDED_2H'
                      else status
                    end
     where id = v_lead
       and ((v_kind = 'CONFIRMATION' and status = 'NEW')
         or (v_kind = 'REMINDER_24H' and status = 'CONFIRMED')
         or (v_kind = 'REMINDER_2H'  and status in ('CONFIRMED', 'REMINDED_24H')));
  end if;
end;
$$;

-- Everything a message template needs, in one call.
create or replace function public.crm_lead_context(p_lead_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', l.id, 'code', l.code, 'status', l.status,
    'parent_name', l.parent_name, 'phone_number', l.phone_number,
    'student_name', l.student_name, 'student_age', l.student_age,
    'course_code', l.course_code, 'course_name', c.name,
    'appointment_time', l.appointment_time,
    'slot_label', s.label,
    'zalo_user_id', l.zalo_user_id,
    'teacher_note', l.teacher_note,
    'trial_completed_at', l.trial_completed_at,
    'branch', jsonb_build_object('code', b.code, 'short_code', b.short_code, 'name', b.name,
                                 'address', b.address, 'maps_url', b.maps_url),
    'latest_video_slug', (select v.share_slug from public.videos v
                          where v.category_code = l.course_code and v.is_published
                          order by v.published_at desc limit 1)
  )
  from public.leads l
  join public.categories c on c.code = l.course_code
  join public.branches b on b.code = l.branch_location
  left join public.trial_slots s on s.id = l.preferred_slot
  where l.id = p_lead_id;
$$;

revoke all on function public.crm_due_messages(timestamptz, int) from public, anon, authenticated;
revoke all on function public.crm_claim_message(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.crm_skip_message(uuid, text, text) from public, anon, authenticated;
revoke all on function public.crm_finish_message(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.crm_lead_context(uuid) from public, anon, authenticated;
grant execute on function public.crm_due_messages(timestamptz, int) to service_role;
grant execute on function public.crm_claim_message(uuid, text, text, jsonb) to service_role;
grant execute on function public.crm_skip_message(uuid, text, text) to service_role;
grant execute on function public.crm_finish_message(uuid, text, text, text) to service_role;
grant execute on function public.crm_lead_context(uuid) to service_role;

-- ─── Staff actions (caller's JWT; checked with is_staff()) ──────────────────
create or replace function public.crm_complete_trial(p_lead_id uuid, p_teacher_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_note text := btrim(coalesce(p_teacher_note, ''));
  v_row  public.leads;
begin
  if not public.is_staff() then
    raise exception 'Chỉ giáo viên / nhân viên TH EDU được thực hiện thao tác này' using hint = 'FORBIDDEN';
  end if;
  if char_length(v_note) < 10 or char_length(v_note) > 1000 then
    raise exception 'Nhận xét của giáo viên cần 10–1000 ký tự' using hint = 'VALIDATION:teacher_note';
  end if;

  update public.leads
     set status = 'COMPLETED_TRIAL',
         teacher_note = v_note,
         trial_completed_at = now(),
         trial_completed_by = auth.uid()
   where id = p_lead_id
     and status in ('NEW', 'CONTACTED', 'CONFIRMED', 'REMINDED_24H', 'REMINDED_2H')
  returning * into v_row;

  if not found then
    if exists (select 1 from public.leads where id = p_lead_id) then
      raise exception 'Buổi học thử này đã được đánh dấu hoàn thành, hoặc đăng ký đã hủy / đã nhập học'
        using hint = 'CONFLICT';
    end if;
    raise exception 'Không tìm thấy đăng ký' using hint = 'NOT_FOUND';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'trial_completed_at', v_row.trial_completed_at,
    'post_trial_due_at', coalesce(v_row.appointment_time + interval '2 hours', v_row.trial_completed_at)
  );
end;
$$;

create or replace function public.crm_set_status(p_lead_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.leads;
begin
  if not public.is_staff() then
    raise exception 'Chỉ giáo viên / nhân viên TH EDU được thực hiện thao tác này' using hint = 'FORBIDDEN';
  end if;
  -- Reminder states are set by the system; COMPLETED_TRIAL via crm_complete_trial (needs a note).
  if p_status not in ('NEW', 'CONTACTED', 'CONFIRMED', 'ENROLLED', 'CANCELLED') then
    raise exception 'Trạng thái không hợp lệ' using hint = 'VALIDATION:status';
  end if;

  update public.leads
     set status = p_status,
         staff_note = coalesce(nullif(btrim(p_note), ''), staff_note)
   where id = p_lead_id
  returning * into v_row;
  if not found then
    raise exception 'Không tìm thấy đăng ký' using hint = 'NOT_FOUND';
  end if;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

revoke all on function public.crm_complete_trial(uuid, text) from public, anon;
revoke all on function public.crm_set_status(uuid, text, text) from public, anon;
grant execute on function public.crm_complete_trial(uuid, text) to authenticated;
grant execute on function public.crm_set_status(uuid, text, text) to authenticated;
