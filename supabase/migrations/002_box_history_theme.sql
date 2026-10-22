-- Update 2: history for the "Для нас" box and a per-person theme.
-- Run once in Supabase → SQL Editor → New query → paste → Run.

alter table public.box add column if not exists done_at timestamptz;
alter table public.box add column if not exists done_by uuid references auth.users on delete set null;

drop policy if exists "box: couple updates" on public.box;
create policy "box: couple updates" on public.box for update to authenticated
  using (couple_id = public.my_couple()) with check (couple_id = public.my_couple());
revoke update on public.box from authenticated;
grant update (done_at, done_by) on public.box to authenticated;

alter table public.profiles add column if not exists theme text not null default 'apothecary';
grant update (name, color, theme) on public.profiles to authenticated;
