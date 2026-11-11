-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
--   • Public (anon + authenticated) READ: categories, branches, published videos,
--     published + consented portfolios.
--   • Public INSERT: leads (NEW only). No public read/update/delete of leads.
--   • Staff (JWT app_metadata.role = 'staff') can read & update leads, manage content.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.categories  enable row level security;
alter table public.branches    enable row level security;
alter table public.videos      enable row level security;
alter table public.portfolios  enable row level security;
alter table public.leads       enable row level security;

-- Helper: is the caller a centre staff member? (set via auth.users.raw_app_meta_data)
create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'staff', false);
$$;

-- ─── Public read ────────────────────────────────────────────────────────────
create policy "public read categories"
  on public.categories for select to anon, authenticated
  using (true);

create policy "public read branches"
  on public.branches for select to anon, authenticated
  using (true);

create policy "public read published videos"
  on public.videos for select to anon, authenticated
  using (is_published and published_at <= now());

create policy "public read consented portfolios"
  on public.portfolios for select to anon, authenticated
  using (is_published and parent_consent);

-- ─── Public lead capture ────────────────────────────────────────────────────
-- Prefer the `api` Edge Function (validation, rate limit, notifications); this policy
-- allows direct PostgREST inserts as the spec requires, but only "fresh" rows.
create policy "public insert leads"
  on public.leads for insert to anon, authenticated
  with check (
    status = 'NEW'
    and notified_at is null
    and notification_log is null
    and (preferred_date is null or preferred_date >= current_date)
  );

-- ─── Staff ──────────────────────────────────────────────────────────────────
create policy "staff read leads"
  on public.leads for select to authenticated
  using (public.is_staff());

create policy "staff update leads"
  on public.leads for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "staff manage videos"
  on public.videos for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "staff manage portfolios"
  on public.portfolios for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ─── Column privileges ──────────────────────────────────────────────────────
-- RLS limits rows; grants limit columns. Anonymous clients may only write lead input fields.
revoke insert, update, delete on public.leads from anon;
grant insert (id, parent_name, phone_number, student_name, student_age, course_code, branch_location,
              quiz_summary, preferred_date, preferred_slot, source, zalo_user_id, quiz_answers)
  on public.leads to anon;
revoke select on public.leads from anon;
