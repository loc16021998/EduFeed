-- ═══════════════════════════════════════════════════════════════════════════
-- Database functions (callable via PostgREST RPC and from the `api` Edge Function)
--   get_feed(category, limit, cursor)  → keyset-paginated published videos
--   submit_lead(payload jsonb)         → validated, idempotent, rate-limited lead insert
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── get_feed ───────────────────────────────────────────────────────────────
-- SECURITY INVOKER: RLS on videos still applies (only published rows).
-- Cursor = (published_at, id) of the last item from the previous page.
create or replace function public.get_feed(
  p_category_code   text        default null,
  p_limit           int         default 10,
  p_before_ts       timestamptz default null,
  p_before_id       uuid        default null
)
returns setof public.videos
language sql
stable
security invoker
set search_path = public
as $$
  select v.*
  from public.videos v
  where v.is_published
    and v.published_at <= now()
    and (p_category_code is null or v.category_code = p_category_code)
    and (
      p_before_ts is null
      or (v.published_at, v.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
  order by v.published_at desc, v.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

grant execute on function public.get_feed(text, int, timestamptz, uuid) to anon, authenticated;

-- ─── submit_lead ────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can check duplicates / rate limits without granting anon SELECT on leads.
-- Errors are raised with stable SQLSTATE-style hints the API maps to HTTP codes:
--   'VALIDATION:<field>'  → 422,  'RATE_LIMITED' → 429
create or replace function public.submit_lead(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id           uuid := coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid());
  v_phone        text := regexp_replace(coalesce(p ->> 'phone_number', ''), '[\s.()-]', '', 'g');
  v_parent       text := btrim(coalesce(p ->> 'parent_name', ''));
  v_student      text := btrim(coalesce(p ->> 'student_name', ''));
  v_age          int;
  v_course       text := p ->> 'course_code';
  v_branch       text := p ->> 'branch_location';
  v_date         date;
  v_existing     public.leads;
  v_row          public.leads;
  v_recent_count int;
begin
  -- Normalise +84xxxxxxxxx → 0xxxxxxxxx
  if v_phone like '+84%' then
    v_phone := '0' || substr(v_phone, 4);
  end if;

  -- Validation (mirrors table CHECKs, but with field-level messages)
  if v_phone !~ '^0[35789][0-9]{8}$' then
    raise exception 'Số điện thoại không hợp lệ' using hint = 'VALIDATION:phone_number';
  end if;
  if char_length(v_parent) not between 2 and 60 or v_parent ~ '[0-9]' then
    raise exception 'Họ tên phụ huynh không hợp lệ' using hint = 'VALIDATION:parent_name';
  end if;
  if char_length(v_student) not between 2 and 60 or v_student ~ '[0-9]' then
    raise exception 'Họ tên của bé không hợp lệ' using hint = 'VALIDATION:student_name';
  end if;
  begin
    v_age := (p ->> 'student_age')::int;
  exception when others then
    v_age := null;
  end;
  if v_age is null or v_age not between 3 and 12 then
    raise exception 'Tuổi của bé không hợp lệ' using hint = 'VALIDATION:student_age';
  end if;
  if not exists (select 1 from public.categories where code = v_course) then
    raise exception 'Khóa học không tồn tại' using hint = 'VALIDATION:course_code';
  end if;
  if not exists (select 1 from public.branches where code = v_branch) then
    raise exception 'Cơ sở không tồn tại' using hint = 'VALIDATION:branch_location';
  end if;
  if p ? 'preferred_date' and nullif(p ->> 'preferred_date', '') is not null then
    v_date := (p ->> 'preferred_date')::date;
    if v_date < current_date or v_date > current_date + 60 then
      raise exception 'Ngày học thử không hợp lệ' using hint = 'VALIDATION:preferred_date';
    end if;
  end if;

  -- Idempotency: same client-generated id → return the original row.
  select * into v_existing from public.leads where id = v_id;
  if found then
    return jsonb_build_object('id', v_existing.id, 'code', v_existing.code,
                              'created_at', v_existing.created_at, 'duplicate', true);
  end if;

  -- Double-submit guard: same phone + child + course within 30 minutes.
  select * into v_existing
  from public.leads
  where phone_number = v_phone
    and course_code = v_course
    and lower(student_name) = lower(v_student)
    and created_at > now() - interval '30 minutes'
  order by created_at desc
  limit 1;
  if found then
    return jsonb_build_object('id', v_existing.id, 'code', v_existing.code,
                              'created_at', v_existing.created_at, 'duplicate', true);
  end if;

  -- Abuse guard: at most 5 leads per phone per 24h.
  select count(*) into v_recent_count
  from public.leads
  where phone_number = v_phone and created_at > now() - interval '24 hours';
  if v_recent_count >= 5 then
    raise exception 'Số điện thoại này đã đăng ký nhiều lần hôm nay' using hint = 'RATE_LIMITED';
  end if;

  insert into public.leads (
    id, parent_name, phone_number, student_name, student_age, course_code, branch_location,
    quiz_summary, preferred_date, preferred_slot, source, zalo_user_id, quiz_answers
  ) values (
    v_id, v_parent, v_phone, v_student, v_age, v_course, v_branch,
    p -> 'quiz_summary',
    v_date,
    nullif(p ->> 'preferred_slot', ''),
    coalesce(nullif(p ->> 'source', ''), 'DIRECT'),
    nullif(p ->> 'zalo_user_id', ''),
    p -> 'quiz_answers'
  )
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'code', v_row.code,
                            'created_at', v_row.created_at, 'duplicate', false);
end;
$$;

revoke all on function public.submit_lead(jsonb) from public;
grant execute on function public.submit_lead(jsonb) to anon, authenticated, service_role;
