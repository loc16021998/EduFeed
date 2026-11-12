-- Daily student-lifecycle follow-ups at 09:00 Vietnam time (02:00 UTC):
-- certificate (T+0), teacher review (T+3), alumni offer (T+7), advisor call (T+14).
--
-- Run ONCE in Dashboard → SQL Editor, after:
--   1. upgrades/20261122090000_lifecycle_upsell.sql
--   2. schedule_reminders_cron.sql (creates the Vault secret `crm_cron_secret` reused here)
--   3. the Edge Function `api` is deployed
-- Re-running is safe (the job is replaced).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('lifecycle-daily') where exists (select 1 from cron.job where jobname = 'lifecycle-daily');

select cron.schedule(
  'lifecycle-daily',
  '0 2 * * *',
  $job$
  select net.http_post(
    url := 'https://wybufjunahxmzfnwxrxq.supabase.co/functions/v1/api/cron/lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

-- Check: select jobname, schedule, active from cron.job;
-- Last runs: select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
