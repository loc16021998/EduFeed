-- ═══════════════════════════════════════════════════════════════════════════
-- Schedule the push dispatcher: every minute, pg_cron calls the Edge Function
--   POST https://<project>.supabase.co/functions/v1/api/cron/push
-- which queues time-based pushes (giờ dạy, lịch học thử, thử thách 21 ngày) and sends everything waiting
-- in public.push_outbox through Expo (see supabase/functions/_shared/pushDispatcher.ts).
--
-- Before running:
--   1. Run supabase/sql/upgrades/20261130090000_push_notifications.sql
--   2. Deploy the function:   npx supabase functions deploy api --no-verify-jwt
--   3. Run schedule_reminders_cron.sql first (it stores the CRON_SECRET in Vault as 'crm_cron_secret').
--      This job reuses that same secret — nothing to paste here.
--   4. Optional: npx supabase secrets set EXPO_ACCESS_TOKEN=<token>  (only if "Enhanced push security"
--      is enabled for the project in the Expo dashboard)
--
-- Re-running is safe: the job is replaced. An idle tick is one tiny query (nothing due → no Expo call).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'crm_cron_secret') then
    raise exception 'Chạy supabase/sql/schedule_reminders_cron.sql trước (tạo secret crm_cron_secret).';
  end if;
end $$;

select cron.unschedule('push-dispatch') where exists (select 1 from cron.job where jobname = 'push-dispatch');

select cron.schedule(
  'push-dispatch',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://wybufjunahxmzfnwxrxq.supabase.co/functions/v1/api/cron/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

-- Check it runs:
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'push-dispatch') order by start_time desc limit 5;
--   select status, count(*) from public.push_outbox group by status;
