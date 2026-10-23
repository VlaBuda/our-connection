-- Update 7: "Скажи, коли зайде / оновить стан" (one-time alerts) and "востаннє в застосунку".
-- Run once in Supabase → SQL Editor → New query → paste → Run.

alter table public.profiles add column if not exists last_seen_at timestamptz;
grant update (name, color, theme, status, status_text, status_at, status_set, ns, last_seen_at) on public.profiles to authenticated;

-- One-time: the watcher gets a push the next time the target opens the app ('open') or updates their state ('update').
create table if not exists public.watches (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  watcher uuid not null references auth.users on delete cascade default auth.uid(),
  target uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('open','update')),
  created_at timestamptz not null default now(),
  unique (watcher, target, kind)
);
alter table public.watches enable row level security;

drop policy if exists "watches: mine" on public.watches;
create policy "watches: mine" on public.watches for select to authenticated
  using (watcher = auth.uid() or target = auth.uid());
drop policy if exists "watches: add" on public.watches;
create policy "watches: add" on public.watches for insert to authenticated
  with check (watcher = auth.uid() and couple_id = public.my_couple() and public.is_partner(target));
drop policy if exists "watches: remove" on public.watches;
create policy "watches: remove" on public.watches for delete to authenticated
  using (watcher = auth.uid() or target = auth.uid());

do $$ begin
  begin alter publication supabase_realtime add table public.watches; exception when duplicate_object then null; end;
end $$;
