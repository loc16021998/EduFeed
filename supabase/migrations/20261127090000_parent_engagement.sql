-- ─────────────────────────────────────────────────────────────────────────────
-- Parent engagement: AI notebook check log, classroom "flash" moments (photo / 5-second voice note from the
-- teacher during class) with reactions and replies.
--
--   ai_checks       one row per AI notebook check: who, when, kind, result. The photo is NOT stored —
--                   the Edge Function sends it to the model and forgets it. 10 checks per parent per day.
--   class_flashes   a teacher's moment for one class (PHOTO | AUDIO ≤ 6 s), kept 7 days, files in the private
--                   bucket class-reports under class/<class_id>/…; visible to that class's parents and teacher.
--   flash_reactions HEART ("Thả tim") / PROUD ("Tự hào quá") — one of each per parent per flash (toggle).
--   flash_replies   short parent replies the teacher reads.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.ai_checks (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid not null references public.users (id) on delete cascade,
  kind          text not null check (kind in ('HANDWRITING', 'MATH')),
  status        text not null default 'PENDING' check (status in ('PENDING', 'DONE', 'FAILED')),
  result        jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index ai_checks_parent_idx on public.ai_checks (parent_id, created_at desc);

create table public.class_flashes (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes (id) on delete cascade,
  teacher_id    uuid references auth.users (id) on delete set null,
  teacher_name  text not null,
  kind          text not null check (kind in ('PHOTO', 'AUDIO')),
  media_path    text not null,
  caption       text check (caption is null or char_length(caption) <= 120),
  duration_sec  numeric(4, 1) check (duration_sec is null or duration_sec between 0 and 6),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days'
);
create index class_flashes_class_idx on public.class_flashes (class_id, created_at desc);

create table public.flash_reactions (
  flash_id    uuid not null references public.class_flashes (id) on delete cascade,
  parent_id   uuid not null references public.users (id) on delete cascade,
  reaction    text not null check (reaction in ('HEART', 'PROUD')),
  created_at  timestamptz not null default now(),
  primary key (flash_id, parent_id, reaction)
);

create table public.flash_replies (
  id          uuid primary key default gen_random_uuid(),
  flash_id    uuid not null references public.class_flashes (id) on delete cascade,
  parent_id   uuid references public.users (id) on delete set null,
  parent_name text not null,
  body        text not null check (char_length(btrim(body)) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index flash_replies_flash_idx on public.flash_replies (flash_id, created_at);

alter table public.ai_checks enable row level security;
alter table public.class_flashes enable row level security;
alter table public.flash_reactions enable row level security;
alter table public.flash_replies enable row level security;
create policy "parent reads own ai checks" on public.ai_checks for select to authenticated
  using (parent_id = public.current_parent_id());
create policy "class parents and teacher read flashes" on public.class_flashes for select to authenticated
  using (public.staff_owns_class(class_id) or public.parent_in_class(class_id));
revoke all on public.ai_checks, public.class_flashes, public.flash_reactions, public.flash_replies from anon;
revoke insert, update, delete on public.ai_checks, public.class_flashes, public.flash_reactions, public.flash_replies from authenticated;

-- Voice notes in the private bucket (photos were already allowed).
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/x-m4a']
 where id = 'class-reports';

-- Safety: never null for non-staff (same fix as in staff_rbac_tasks, for databases that ran the older copy).
create or replace function public.staff_owns_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce: for non-staff staff_kind() is null, and null must mean 'no', not 'unknown'.
  select coalesce(public.staff_kind() in ('ADMIN', 'MANAGER'), false)
      or exists (select 1 from public.classes where id = p_class_id and teacher_id = auth.uid());
$$;

-- ─── AI checks (service role, called by the Edge Function) ──────────────────

-- Start a check for the parent behind this auth user; enforces the daily limit.
create or replace function public.ai_check_begin(p_auth_user_id uuid, p_kind text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_id     uuid;
  v_used   int;
begin
  select id into v_parent from public.users where auth_user_id = p_auth_user_id and is_active and role = 'PARENT';
  if v_parent is null then
    raise exception 'Cần đăng nhập tài khoản phụ huynh' using hint = 'UNAUTHORIZED';
  end if;
  if p_kind not in ('HANDWRITING', 'MATH') then
    raise exception 'Loại bài không hợp lệ' using hint = 'VALIDATION:kind';
  end if;
  select count(*) into v_used from public.ai_checks
   where parent_id = v_parent and created_at > date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
  if v_used >= 10 then
    raise exception 'Hôm nay ba mẹ đã dùng hết 10 lượt chấm. Mai mình chấm tiếp nhé!' using hint = 'RATE_LIMITED';
  end if;
  insert into public.ai_checks (parent_id, kind) values (v_parent, p_kind) returning id into v_id;
  return jsonb_build_object('id', v_id, 'remaining', 9 - v_used);
end;
$$;

create or replace function public.ai_check_finish(p_id uuid, p_ok boolean, p_result jsonb, p_error text default null)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.ai_checks
     set status = case when p_ok then 'DONE' else 'FAILED' end, result = p_result, error = left(p_error, 500), finished_at = now()
   where id = p_id;
$$;

-- ─── Classroom flash ────────────────────────────────────────────────────────

create or replace function public.flash_create(p_class_id uuid, p_kind text, p_path text, p_caption text default null, p_duration numeric default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_teacher text;
  v_id      uuid;
begin
  if not public.staff_owns_class(p_class_id) then
    raise exception 'Bạn không phụ trách lớp này' using hint = 'FORBIDDEN';
  end if;
  if p_kind not in ('PHOTO', 'AUDIO') then
    raise exception 'Loại không hợp lệ' using hint = 'VALIDATION:kind';
  end if;
  if public.storage_class_folder(p_path) is distinct from p_class_id then
    raise exception 'Tệp không thuộc lớp này' using hint = 'VALIDATION:path';
  end if;
  if p_kind = 'AUDIO' and (p_duration is null or p_duration > 6) then
    raise exception 'Ghi âm tối đa 5 giây' using hint = 'VALIDATION:duration';
  end if;
  if p_caption is not null and char_length(p_caption) > 120 then
    raise exception 'Chú thích tối đa 120 ký tự' using hint = 'VALIDATION:caption';
  end if;
  select coalesce(p.display_name, nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(u.email, '@', 1))
    into v_teacher from auth.users u left join public.staff_profiles p on p.user_id = u.id where u.id = auth.uid();
  insert into public.class_flashes (class_id, teacher_id, teacher_name, kind, media_path, caption, duration_sec)
  values (p_class_id, auth.uid(), left(coalesce(v_teacher, 'Giáo viên'), 60), p_kind, p_path, nullif(btrim(coalesce(p_caption, '')), ''), p_duration)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- Parent: moments of the last 7 days from my children's classes (+ my reactions, counts).
-- Teacher / admin: p_class_id = a class they own (with replies).
create or replace function public.flash_feed(p_class_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parent uuid := public.current_parent_id();
begin
  if p_class_id is not null and not public.staff_owns_class(p_class_id) then
    raise exception 'Bạn không phụ trách lớp này' using hint = 'FORBIDDEN';
  end if;
  if p_class_id is null and v_parent is null then
    raise exception 'Cần đăng nhập tài khoản phụ huynh' using hint = 'UNAUTHORIZED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'class_id', f.class_id, 'class_name', c.name, 'teacher_name', f.teacher_name, 'kind', f.kind,
      'media_path', f.media_path, 'caption', f.caption, 'duration_sec', f.duration_sec, 'created_at', f.created_at,
      'hearts', (select count(*) from public.flash_reactions r where r.flash_id = f.id and r.reaction = 'HEART'),
      'prouds', (select count(*) from public.flash_reactions r where r.flash_id = f.id and r.reaction = 'PROUD'),
      'my_reactions', coalesce((select jsonb_agg(r.reaction) from public.flash_reactions r where r.flash_id = f.id and r.parent_id = v_parent), '[]'::jsonb),
      'replies', case when p_class_id is not null then coalesce((
                   select jsonb_agg(jsonb_build_object('parent_name', x.parent_name, 'body', x.body, 'created_at', x.created_at) order by x.created_at)
                   from public.flash_replies x where x.flash_id = f.id), '[]'::jsonb)
                 else coalesce((
                   select jsonb_agg(jsonb_build_object('parent_name', x.parent_name, 'body', x.body, 'created_at', x.created_at) order by x.created_at)
                   from public.flash_replies x where x.flash_id = f.id and x.parent_id = v_parent), '[]'::jsonb) end)
      order by f.created_at desc)
    from public.class_flashes f join public.classes c on c.id = f.class_id
    where f.expires_at > now()
      and (case when p_class_id is not null then f.class_id = p_class_id else public.parent_in_class(f.class_id) end)), '[]'::jsonb);
end;
$$;

create or replace function public.flash_react(p_flash_id uuid, p_reaction text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_parent uuid := public.current_parent_id();
  v_class  uuid;
  v_on     boolean;
begin
  select class_id into v_class from public.class_flashes where id = p_flash_id and expires_at > now();
  if v_parent is null or v_class is null or not public.parent_in_class(v_class) then
    raise exception 'Không tìm thấy khoảnh khắc' using hint = 'NOT_FOUND';
  end if;
  if p_reaction not in ('HEART', 'PROUD') then
    raise exception 'Cảm xúc không hợp lệ' using hint = 'VALIDATION:reaction';
  end if;
  delete from public.flash_reactions where flash_id = p_flash_id and parent_id = v_parent and reaction = p_reaction;
  if not found then
    insert into public.flash_reactions (flash_id, parent_id, reaction) values (p_flash_id, v_parent, p_reaction);
    v_on := true;
  else
    v_on := false;
  end if;
  return jsonb_build_object('reaction', p_reaction, 'on', v_on);
end;
$$;

create or replace function public.flash_reply(p_flash_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_parent public.users;
  v_class  uuid;
begin
  select * into v_parent from public.users where id = public.current_parent_id();
  select class_id into v_class from public.class_flashes where id = p_flash_id and expires_at > now();
  if v_parent.id is null or v_class is null or not public.parent_in_class(v_class) then
    raise exception 'Không tìm thấy khoảnh khắc' using hint = 'NOT_FOUND';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 300 then
    raise exception 'Lời nhắn 1–300 ký tự' using hint = 'VALIDATION:body';
  end if;
  if (select count(*) from public.flash_replies where flash_id = p_flash_id and parent_id = v_parent.id) >= 5 then
    raise exception 'Tối đa 5 lời nhắn cho mỗi khoảnh khắc' using hint = 'RATE_LIMITED';
  end if;
  insert into public.flash_replies (flash_id, parent_id, parent_name, body) values (p_flash_id, v_parent.id, v_parent.full_name, btrim(p_body));
  return jsonb_build_object('ok', true);
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.ai_check_begin(uuid, text) from public, anon, authenticated;
revoke all on function public.ai_check_finish(uuid, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.ai_check_begin(uuid, text) to service_role;
grant execute on function public.ai_check_finish(uuid, boolean, jsonb, text) to service_role;
do $$
declare f text;
begin
  foreach f in array array['public.flash_create(uuid, text, text, text, numeric)', 'public.flash_feed(uuid)',
                           'public.flash_react(uuid, text)', 'public.flash_reply(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
