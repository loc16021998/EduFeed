-- ═══════════════════════════════════════════════════════════════════════════
-- App release config: store version gate (soft "nên cập nhật" / force "bắt buộc cập nhật").
-- One row per platform. Read by everyone (anon included — the check runs before sign-in),
-- edited only by admins in the Supabase Table Editor (or SQL).
--
--   min_supported_version : installed version BELOW this → blocking "Bắt buộc cập nhật" screen
--   latest_version        : installed version below this → dismissible "Đã có phiên bản mới" card
--   is_force_update       : true → treat ANY version below latest_version as forced (hotfix)
--   store_url             : Google Play / App Store link opened by the buttons
--   release_notes_vi      : short Vietnamese highlights shown to parents / teachers
--
-- Safe defaults: min 0.0.0 (never blocks), latest = current version. Empty store_url → the
-- prompts are not shown (nothing to open).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.app_release_config (
  platform text primary key check (platform in ('android', 'ios')),
  min_supported_version text not null default '0.0.0' check (min_supported_version ~ '^\d{1,6}(\.\d{1,6}){0,2}$'),
  latest_version text not null default '0.0.0' check (latest_version ~ '^\d{1,6}(\.\d{1,6}){0,2}$'),
  store_url text not null default '' check (store_url = '' or store_url ~* '^https://'),
  release_notes_vi text not null default '' check (char_length(release_notes_vi) <= 600),
  is_force_update boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.app_release_config is 'Store version gate for the mobile apps (soft / force update). Public read, admin write.';

create or replace function public.app_release_config_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists app_release_config_touch on public.app_release_config;
create trigger app_release_config_touch before update on public.app_release_config
  for each row execute function public.app_release_config_touch();

alter table public.app_release_config enable row level security;

drop policy if exists app_release_config_read on public.app_release_config;
create policy app_release_config_read on public.app_release_config for select to anon, authenticated using (true);

-- No insert / update / delete policies: only the dashboard (service role) or SQL can change it.
revoke insert, update, delete on public.app_release_config from anon, authenticated;
grant select on public.app_release_config to anon, authenticated;

insert into public.app_release_config (platform, min_supported_version, latest_version, store_url, release_notes_vi)
values
  ('android', '0.0.0', '0.1.0', '', ''),
  ('ios', '0.0.0', '0.1.0', '', '')
on conflict (platform) do nothing;
