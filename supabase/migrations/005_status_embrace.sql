-- Update 5: "Обійняти" nudge and "Що я зараз роблю" status.
-- Run once in Supabase → SQL Editor → New query → paste → Run.

alter table public.nudges drop constraint if exists nudges_kind_check;
alter table public.nudges add constraint nudges_kind_check check (kind in ('water','food','rest','hug','embrace'));

-- Status lives on the profile, so it carries over to the next day (e.g. several days on position).
alter table public.profiles add column if not exists status text;          -- key from the list, or 'own'
alter table public.profiles add column if not exists status_text text;     -- own words when status = 'own'
alter table public.profiles add column if not exists status_at timestamptz;
alter table public.profiles add column if not exists status_set text not null default 'civil'; -- 'civil' | 'military'
grant update (name, color, theme, status, status_text, status_at, status_set) on public.profiles to authenticated;
