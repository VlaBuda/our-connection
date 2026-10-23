-- Update 6: "Нервова система" — long states (burnout etc.) and episodes (meltdown, shutdown...) with recovery time.
-- Run once in Supabase → SQL Editor → New query → paste → Run.

-- {long:[{k, text?, since}], episodes:[{id, k, ts, end?}]}. On the profile, so it carries over days.
alter table public.profiles add column if not exists ns jsonb not null default '{}';
grant update (name, color, theme, status, status_text, status_at, status_set, ns) on public.profiles to authenticated;
