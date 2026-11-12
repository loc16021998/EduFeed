-- ─────────────────────────────────────────────────────────────────────────────
-- Parents manage their own trial bookings (no account): see status, reschedule, cancel.
--
-- Proof of ownership = the booking's id (a random UUID generated on the parent's device and only
-- stored there + shown to staff) AND the phone number used for the booking. Both must match.
--
--   parent_booking_status(id, phone)                 → status / appointment / code
--   parent_reschedule_booking(id, phone, date, slot) → new date + slot; reminders re-armed for the new time
--   parent_cancel_booking(id, phone, reason)         → CANCELLED (no more reminders)
--
-- Every change is appended to leads.staff_note so teachers see what happened in the trial schedule.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.leads add column if not exists parent_reschedules smallint not null default 0;

create or replace function public.parent_find_lead(p_id uuid, p_phone text)
returns public.leads
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s.()-]', '', 'g');
  v_row   public.leads;
begin
  if v_phone like '+84%' then
    v_phone := '0' || substr(v_phone, 4);
  end if;
  select * into v_row from public.leads where id = p_id and phone_number = v_phone;
  if not found then
    raise exception 'Không tìm thấy lịch hẹn' using hint = 'NOT_FOUND';
  end if;
  return v_row;
end;
$$;
revoke all on function public.parent_find_lead(uuid, text) from public, anon, authenticated;

create or replace function public.parent_booking_status(p_id uuid, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.leads := public.parent_find_lead(p_id, p_phone);
begin
  return jsonb_build_object(
    'id', v.id, 'code', v.code, 'status', v.status,
    'preferred_date', v.preferred_date, 'preferred_slot', v.preferred_slot,
    'appointment_time', v.appointment_time,
    'can_change', v.status in ('NEW', 'CONTACTED', 'CONFIRMED', 'REMINDED_24H', 'REMINDED_2H')
                  and coalesce(v.appointment_time, now() + interval '1 day') > now(),
    'reschedules_left', greatest(0, 3 - v.parent_reschedules)
  );
end;
$$;

create or replace function public.parent_reschedule_booking(p_id uuid, p_phone text, p_date date, p_slot text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v       public.leads := public.parent_find_lead(p_id, p_phone);
  v_kind  text;
  v_at    timestamptz;
  v_label text;
  v_old   text;
begin
  if v.status not in ('NEW', 'CONTACTED', 'CONFIRMED', 'REMINDED_24H', 'REMINDED_2H') then
    raise exception 'Lịch hẹn này không thể đổi nữa (đã học thử, đã hủy hoặc đã nhập học)' using hint = 'CONFLICT';
  end if;
  if v.parent_reschedules >= 3 then
    raise exception 'Ba mẹ đã đổi lịch 3 lần. Vui lòng gọi hotline để được hỗ trợ.' using hint = 'RATE_LIMITED';
  end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date or p_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date + 60 then
    raise exception 'Ngày học thử không hợp lệ' using hint = 'VALIDATION:preferred_date';
  end if;
  v_kind := case when extract(isodow from p_date) in (6, 7) then 'WEEKEND' else 'WEEKDAY' end;
  select (p_date + s.start_time) at time zone 'Asia/Ho_Chi_Minh', s.label into v_at, v_label
  from public.trial_slots s where s.id = p_slot and s.kind = v_kind;
  if v_at is null then
    raise exception 'Khung giờ không hợp lệ cho ngày đã chọn' using hint = 'VALIDATION:preferred_slot';
  end if;
  if v_at < now() + interval '2 hours' then
    raise exception 'Vui lòng chọn giờ học thử cách thời điểm hiện tại ít nhất 2 giờ' using hint = 'VALIDATION:preferred_slot';
  end if;
  if v.preferred_date = p_date and v.preferred_slot = p_slot then
    raise exception 'Đây đã là lịch hiện tại của ba mẹ' using hint = 'VALIDATION:preferred_slot';
  end if;

  v_old := coalesce(to_char(v.appointment_time at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), 'chưa có');

  update public.leads
     set preferred_date = p_date,
         preferred_slot = p_slot,
         -- Reminders were for the old time: back to CONFIRMED so the cron reminds again for the new one.
         status = case when status in ('REMINDED_24H', 'REMINDED_2H') then 'CONFIRMED' else status end,
         parent_reschedules = parent_reschedules + 1,
         staff_note = left(concat_ws(E'\n', nullif(staff_note, ''),
                        format('[%s] Phụ huynh đổi lịch: %s → %s', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'),
                               v_old, to_char(v_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'))), 1000)
   where id = v.id
  returning * into v;

  -- Allow the 24h / 2h reminders to be sent again for the new appointment.
  delete from public.crm_logs where lead_id = v.id and kind in ('REMINDER_24H', 'REMINDER_2H');

  return jsonb_build_object('id', v.id, 'status', v.status, 'preferred_date', v.preferred_date,
                            'preferred_slot', v.preferred_slot, 'appointment_time', v.appointment_time,
                            'slot_label', v_label, 'reschedules_left', greatest(0, 3 - v.parent_reschedules));
end;
$$;

create or replace function public.parent_cancel_booking(p_id uuid, p_phone text, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v public.leads := public.parent_find_lead(p_id, p_phone);
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
begin
  if v.status = 'CANCELLED' then
    return jsonb_build_object('id', v.id, 'status', v.status);
  end if;
  if v.status not in ('NEW', 'CONTACTED', 'CONFIRMED', 'REMINDED_24H', 'REMINDED_2H') then
    raise exception 'Lịch hẹn này không thể hủy (đã học thử hoặc đã nhập học)' using hint = 'CONFLICT';
  end if;
  update public.leads
     set status = 'CANCELLED',
         staff_note = left(concat_ws(E'\n', nullif(staff_note, ''),
                        format('[%s] Phụ huynh tự hủy lịch%s', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'),
                               coalesce(': ' || v_reason, ''))), 1000)
   where id = v.id
  returning * into v;
  return jsonb_build_object('id', v.id, 'status', v.status);
end;
$$;

revoke all on function public.parent_booking_status(uuid, text) from public;
revoke all on function public.parent_reschedule_booking(uuid, text, date, text) from public;
revoke all on function public.parent_cancel_booking(uuid, text, text) from public;
grant execute on function public.parent_booking_status(uuid, text) to anon, authenticated;
grant execute on function public.parent_reschedule_booking(uuid, text, date, text) to anon, authenticated;
grant execute on function public.parent_cancel_booking(uuid, text, text) to anon, authenticated;
