-- ─────────────────────────────────────────────────────────────────────────────
-- Business data is admin-only (separate admin area vs teacher / staff area).
--
--   dashboard_summary()   KPIs, revenue, channels, funnel → admins only
--   course_fees           tuition → admins only
--
-- Teachers / staff keep what they need for their work: videos, the trial schedule (leads), CRM actions.
-- dashboard_summary keeps its signature: the previous body becomes dashboard_summary_core (not callable
-- by clients) and dashboard_summary checks is_admin() first.
-- ─────────────────────────────────────────────────────────────────────────────

alter function public.dashboard_summary(text, int, timestamptz) rename to dashboard_summary_core;
revoke all on function public.dashboard_summary_core(text, int, timestamptz) from public, anon, authenticated;

create function public.dashboard_summary(
  p_branch  text default null,
  p_days    int default 30,
  p_now     timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được xem số liệu kinh doanh' using hint = 'FORBIDDEN';
  end if;
  return public.dashboard_summary_core(p_branch, p_days, p_now);
end;
$$;

revoke all on function public.dashboard_summary(text, int, timestamptz) from public, anon;
grant execute on function public.dashboard_summary(text, int, timestamptz) to authenticated;

drop policy if exists "staff read course fees"   on public.course_fees;
drop policy if exists "staff insert course fees" on public.course_fees;
drop policy if exists "staff update course fees" on public.course_fees;
drop policy if exists "staff delete course fees" on public.course_fees;

create policy "admin read course fees"   on public.course_fees for select to authenticated using (public.is_admin());
create policy "admin insert course fees" on public.course_fees for insert to authenticated with check (public.is_admin());
create policy "admin update course fees" on public.course_fees for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin delete course fees" on public.course_fees for delete to authenticated using (public.is_admin());
