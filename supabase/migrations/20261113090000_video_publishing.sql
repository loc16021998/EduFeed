-- ═══════════════════════════════════════════════════════════════════════════
-- Video publishing by staff + share links + per-video lead attribution
--   storage bucket  feed-media         public read, staff-only write (videos + cover images)
--   videos          share_slug         short id for share links:  https://<web>/v/<share_slug>
--                   video_path / thumbnail_path / created_by
--   leads           source_ref         which video (id) brought this lead; source 'SHARE_LINK'
--   staff_video_stats()                leads per video, for the staff video list
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Storage bucket ─────────────────────────────────────────────────────────
-- 200 MB per file here; the project-wide upload limit (Dashboard → Storage → Settings)
-- also applies — it is 50 MB on the Free plan.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feed-media', 'feed-media', true, 209715200,
  array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket → anyone can read by URL. Only staff may write.
create policy "staff upload feed media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'feed-media' and public.is_staff());

create policy "staff update feed media"
  on storage.objects for update to authenticated
  using (bucket_id = 'feed-media' and public.is_staff())
  with check (bucket_id = 'feed-media' and public.is_staff());

create policy "staff delete feed media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'feed-media' and public.is_staff());

-- ─── videos: share slug + storage paths + author ───────────────────────────
alter table public.videos
  add column share_slug     text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  add column video_path     text,
  add column thumbnail_path text,
  add column created_by     uuid default auth.uid() references auth.users (id) on delete set null;

alter table public.videos add constraint videos_share_slug_key unique (share_slug);
alter table public.videos add constraint videos_cta_text_len check (char_length(cta_text) between 3 and 80);

-- ─── leads: attribution ─────────────────────────────────────────────────────
alter table public.leads add column source_ref text check (source_ref is null or char_length(source_ref) <= 64);
create index leads_source_ref_idx on public.leads (source_ref) where source_ref is not null;

alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check
  check (source in ('FEED', 'QUIZ', 'PORTFOLIO', 'DIRECT', 'SHARE_LINK'));

grant insert (source_ref) on public.leads to anon;

-- ─── staff_video_stats ──────────────────────────────────────────────────────
-- SECURITY INVOKER: non-staff see no leads (RLS) → all counts 0.
create or replace function public.staff_video_stats()
returns table (video_id uuid, lead_count bigint, last_lead_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select v.id, count(l.id), max(l.created_at)
  from public.videos v
  left join public.leads l on l.source_ref = v.id::text
  group by v.id;
$$;

revoke all on function public.staff_video_stats() from public;
grant execute on function public.staff_video_stats() to authenticated;

-- ─── submit_lead: accept source_ref (+ SHARE_LINK source) ──────────────────
-- Re-declared; otherwise identical to 20261112090000_trust.sql.
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
  v_promo        text := nullif(p ->> 'promo_code', '');
  v_source       text := coalesce(nullif(p ->> 'source', ''), 'DIRECT');
  v_source_ref   text := nullif(left(coalesce(p ->> 'source_ref', ''), 64), '');
  v_date         date;
  v_existing     public.leads;
  v_row          public.leads;
  v_recent_count int;
begin
  if v_phone like '+84%' then
    v_phone := '0' || substr(v_phone, 4);
  end if;

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
  if v_promo is not null and v_promo not in ('EBOOK_VAO_LOP_1') then
    raise exception 'Mã ưu đãi không hợp lệ' using hint = 'VALIDATION:promo_code';
  end if;
  if v_source not in ('FEED', 'QUIZ', 'PORTFOLIO', 'DIRECT', 'SHARE_LINK') then
    raise exception 'Nguồn không hợp lệ' using hint = 'VALIDATION:source';
  end if;
  if p ? 'preferred_date' and nullif(p ->> 'preferred_date', '') is not null then
    v_date := (p ->> 'preferred_date')::date;
    if v_date < current_date or v_date > current_date + 60 then
      raise exception 'Ngày học thử không hợp lệ' using hint = 'VALIDATION:preferred_date';
    end if;
  end if;

  select * into v_existing from public.leads where id = v_id;
  if found then
    return jsonb_build_object('id', v_existing.id, 'code', v_existing.code,
                              'created_at', v_existing.created_at, 'duplicate', true);
  end if;

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

  select count(*) into v_recent_count
  from public.leads
  where phone_number = v_phone and created_at > now() - interval '24 hours';
  if v_recent_count >= 5 then
    raise exception 'Số điện thoại này đã đăng ký nhiều lần hôm nay' using hint = 'RATE_LIMITED';
  end if;

  insert into public.leads (
    id, parent_name, phone_number, student_name, student_age, course_code, branch_location,
    quiz_summary, preferred_date, preferred_slot, source, source_ref, zalo_user_id, quiz_answers, promo_code
  ) values (
    v_id, v_parent, v_phone, v_student, v_age, v_course, v_branch,
    p -> 'quiz_summary',
    v_date,
    nullif(p ->> 'preferred_slot', ''),
    v_source,
    v_source_ref,
    nullif(p ->> 'zalo_user_id', ''),
    p -> 'quiz_answers',
    v_promo
  )
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'code', v_row.code,
                            'created_at', v_row.created_at, 'duplicate', false);
end;
$$;
