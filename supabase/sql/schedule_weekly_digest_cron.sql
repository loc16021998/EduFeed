-- Schedule the weekly progress report ("Báo cáo tiến độ tuần"):
--   POST https://<project>.supabase.co/functions/v1/api/cron/weekly-digest
-- Sunday 19:30 → 21:50 (Asia/Ho_Chi_Minh) every 10 minutes: each tick builds + publishes the reports not done
-- yet, queues the push WEEKLY_REPORT_READY (and an optional Zalo summary). Ticks before 19:30 do nothing.
-- Monday 08:00 → 11:00 hourly: catch-up for last week if Sunday's run was interrupted (already-published
-- reports are skipped, so nothing is sent twice).
--
-- Before running:
--   1. Run supabase/sql/upgrades/20261201090000_weekly_progress_reports.sql
--   2. Deploy the function:   npx supabase functions deploy api --no-verify-jwt
--   3. Run schedule_reminders_cron.sql first (it stores the CRON_SECRET in Vault as 'crm_cron_secret').
--   4. Optional secrets (npx supabase secrets set …):
--        WEEKLY_REPORT_AI=1            reword highlights / tips with Claude (needs ANTHROPIC_API_KEY)
--        ZNS_TEMPLATE_WEEKLY_REPORT=   approved ZNS template: C_NAME, STUDENT_NAME, WEEK, ATTENDANCE, STREAK, REPORT_URL
--
-- pg_cron runs in UTC: Sunday 12:00–14:50 UTC = 19:00–21:50 VN; Monday 01:00–04:00 UTC = 08:00–11:00 VN.
-- Re-running this file is safe: the jobs are replaced.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'crm_cron_secret') then
    raise exception 'Chạy supabase/sql/schedule_reminders_cron.sql trước (tạo secret crm_cron_secret).';
  end if;
end $$;

select cron.unschedule('weekly-digest') where exists (select 1 from cron.job where jobname = 'weekly-digest');
select cron.unschedule('weekly-digest-catchup') where exists (select 1 from cron.job where jobname = 'weekly-digest-catchup');

select cron.schedule(
  'weekly-digest',
  '*/10 12-14 * * 0',
  $job$
  select net.http_post(
    url := 'https://wybufjunahxmzfnwxrxq.supabase.co/functions/v1/api/cron/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
  $job$
);

select cron.schedule(
  'weekly-digest-catchup',
  '0 1-4 * * 1',
  $job$
  select net.http_post(
    url := 'https://wybufjunahxmzfnwxrxq.supabase.co/functions/v1/api/cron/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
  $job$
);

-- Check:
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'weekly-digest') order by start_time desc limit 5;
--   select week_start_date, count(*) filter (where published_at is not null) as sent,
--          count(*) filter (where parent_viewed_at is not null) as seen
--   from public.weekly_progress_reports group by 1 order by 1 desc limit 8;
