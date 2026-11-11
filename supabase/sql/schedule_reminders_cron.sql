-- ═══════════════════════════════════════════════════════════════════════════
-- Schedule the CRM reminder job: every 15 minutes, pg_cron calls the Edge Function
--   POST https://<project>.supabase.co/functions/v1/api/cron/reminders
-- which sends due T-24h / T-2h / T+2h messages (see supabase/functions/_shared/reminderCron.ts).
--
-- Before running:
--   1. Deploy the function:   npx supabase functions deploy api --no-verify-jwt
--   2. Generate a long random secret (≥ 24 chars), e.g.:  openssl rand -hex 32
--   3. Give it to the function:  npx supabase secrets set CRON_SECRET=<secret>
--   4. Replace <CRON_SECRET> below with the SAME value, then run this file in the SQL Editor.
--
-- The secret is stored in Supabase Vault (encrypted), not in the cron job text.
-- Re-running is safe: the job is replaced, the secret updated.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store / update the secret in Vault.
do $$
begin
  if exists (select 1 from vault.secrets where name = 'crm_cron_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'crm_cron_secret'), '<CRON_SECRET>');
  else
    perform vault.create_secret('<CRON_SECRET>', 'crm_cron_secret', 'x-cron-secret for /api/cron/reminders');
  end if;
end $$;

-- (Re)create the job.
select cron.unschedule('crm-reminders') where exists (select 1 from cron.job where jobname = 'crm-reminders');

select cron.schedule(
  'crm-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://wybufjunahxmzfnwxrxq.supabase.co/functions/v1/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

-- Check it ran (after ~15 min):
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'crm-reminders') order by start_time desc limit 5;
--   select status_code, content::text, created from net._http_response order by created desc limit 5;
