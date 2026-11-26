-- ═══════════════════════════════════════════════════════════════════════════
-- Hardening: account / admin / presenter functions are for signed-in users only.
-- Postgres grants EXECUTE to PUBLIC by default, so anon could call them; each one already
-- refuses guests inside ("Cần đăng nhập" / "Chỉ quản trị viên"), this removes the entry point too.
-- Public features (feed, comments, booking, certificates, payments…) are not touched.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.account_role()',
    'public.my_account()',
    'public.update_my_profile(text, text)',
    'public.request_account_deletion(text)',
    'public.cancel_account_deletion()',
    'public.admin_deletion_requests(text)',
    'public.admin_resolve_deletion(uuid, text)',
    'public.admin_release_config_save(text, text, text, text, text, boolean)',
    'public.admin_ad_spend_save(text, text, date, bigint, text)',
    'public.admin_command_overview(text, int, timestamptz)',
    'public.admin_class_report_status(text, date)',
    'public.admin_recent_comments(text, int)',
    'public.admin_system_health()',
    'public.video_presenters_list()',
    'public.video_presenter_save(uuid, text, text, boolean)',
    'public.video_presenter_archive(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
