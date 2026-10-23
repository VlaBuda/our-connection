-- Update 3: nudges once per 2 hours, "rest" nudge, replies with thanks,
-- and the "Хочу тобі показати" photo feed.
-- Run once in Supabase → SQL Editor → New query → paste → Run.

-- ---------- nudges ----------
-- New kind "rest".
alter table public.nudges drop constraint if exists nudges_kind_check;
alter table public.nudges add constraint nudges_kind_check check (kind in ('water','food','rest','hug'));

-- Rows are no longer deleted on dismiss, so the 2-hour limit can see them.
alter table public.nudges add column if not exists dismissed_at timestamptz;   -- recipient closed it
alter table public.nudges add column if not exists answered_at timestamptz;    -- recipient pressed "Пʼю воду" etc.
alter table public.nudges add column if not exists thanks_seen_at timestamptz; -- sender closed the thank-you

-- One nudge of each kind per 2 hours from the same person.
create or replace function public.nudge_ok(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from nudges
    where from_user = auth.uid() and kind = k and created_at > now() - interval '2 hours'
  )
$$;

drop policy if exists "nudges: send to partner" on public.nudges;
create policy "nudges: send to partner" on public.nudges for insert to authenticated
  with check (from_user = auth.uid() and couple_id = public.my_couple()
              and public.is_partner(to_user) and public.nudge_ok(kind));

drop policy if exists "nudges: update mine" on public.nudges;
create policy "nudges: update mine" on public.nudges for update to authenticated
  using (to_user = auth.uid() or from_user = auth.uid())
  with check (to_user = auth.uid() or from_user = auth.uid());
revoke update on public.nudges from authenticated;
grant update (dismissed_at, answered_at, thanks_seen_at) on public.nudges to authenticated;

-- ---------- "Хочу тобі показати" ----------
create table if not exists public.shows (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author uuid not null references auth.users on delete cascade default auth.uid(),
  path text not null,
  caption text not null default '' check (char_length(caption) <= 500),
  created_at timestamptz not null default now()
);
alter table public.shows enable row level security;

drop policy if exists "shows: couple reads" on public.shows;
create policy "shows: couple reads" on public.shows for select to authenticated
  using (couple_id = public.my_couple());
drop policy if exists "shows: add mine" on public.shows;
create policy "shows: add mine" on public.shows for insert to authenticated
  with check (couple_id = public.my_couple() and author = auth.uid());
drop policy if exists "shows: remove mine" on public.shows;
create policy "shows: remove mine" on public.shows for delete to authenticated
  using (author = auth.uid());

-- Private storage for the photos: <couple_id>/<user_id>/<file>.jpg, up to 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shows', 'shows', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "shows files: couple reads" on storage.objects;
create policy "shows files: couple reads" on storage.objects for select to authenticated
  using (bucket_id = 'shows' and (storage.foldername(name))[1] = public.my_couple()::text);
drop policy if exists "shows files: add mine" on storage.objects;
create policy "shows files: add mine" on storage.objects for insert to authenticated
  with check (bucket_id = 'shows'
              and (storage.foldername(name))[1] = public.my_couple()::text
              and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "shows files: remove mine" on storage.objects;
create policy "shows files: remove mine" on storage.objects for delete to authenticated
  using (bucket_id = 'shows' and (storage.foldername(name))[2] = auth.uid()::text);

do $$ begin
  begin alter publication supabase_realtime add table public.shows; exception when duplicate_object then null; end;
end $$;
