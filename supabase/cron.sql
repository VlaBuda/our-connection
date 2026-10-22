-- Runs the reminder check every 20 minutes.
-- Replace YOUR_CRON_SECRET with the same value you saved as the CRON_SECRET
-- secret of the notify function, then run in Supabase → SQL Editor.

select cron.unschedule('our-connection-tick')
where exists (select 1 from cron.job where jobname = 'our-connection-tick');

select cron.schedule(
  'our-connection-tick',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := 'https://usucbzsikqieaywmfkfd.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body := '{"type":"tick"}'::jsonb
  );
  $$
);
