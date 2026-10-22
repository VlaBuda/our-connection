-- Запас сил: database schema.
-- Run once in Supabase → SQL Editor → New query → paste → Run.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- tables ----------
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  color text not null default 'red',
  couple_id uuid references public.couples on delete set null,
  created_at timestamptz not null default now()
);

-- Shared daily state: energy, sleep, head, mood, need, water, food...
create table if not exists public.days (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  day date not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Private items: tasks and self-care, visible only to the owner.
create table if not exists public.private_items (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  id text not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- "Для нас" box.
create table if not exists public.box (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author uuid not null references auth.users on delete cascade default auth.uid(),
  text text not null check (char_length(text) between 1 and 1000),
  kind text not null default 'tell',
  created_at timestamptz not null default now()
);

-- Nudges: "нагадати попити", "думаю про тебе".
create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  from_user uuid not null references auth.users on delete cascade default auth.uid(),
  to_user uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('water','food','hug')),
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Used by the notify function to avoid repeating reminders.
create table if not exists public.reminders_sent (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- ---------- helpers ----------
create or replace function public.my_couple() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from profiles where id = auth.uid()
$$;

create or replace function public.is_partner(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = other and p.couple_id is not null and p.couple_id = public.my_couple()
  )
$$;

-- New account → profile row (name and color come from sign-up form).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, color)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', ''),
          coalesce(new.raw_user_meta_data->>'color', 'red'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pairing.
create or replace function public.create_couple() returns text
language plpgsql security definer set search_path = public as $$
declare cid uuid; code text;
begin
  select couple_id into cid from profiles where id = auth.uid();
  if cid is not null then
    select invite_code into code from couples where id = cid;
    return code;
  end if;
  insert into couples default values returning id, invite_code into cid, code;
  update profiles set couple_id = cid where id = auth.uid();
  return code;
end $$;

create or replace function public.join_couple(code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid uuid; n int;
begin
  select id into cid from couples where invite_code = upper(trim(code));
  if cid is null then return false; end if;
  select count(*) into n from profiles where couple_id = cid and id <> auth.uid();
  if n >= 2 then return false; end if;
  update profiles set couple_id = cid where id = auth.uid();
  return true;
end $$;

create or replace function public.my_invite_code() returns text
language sql stable security definer set search_path = public as $$
  select invite_code from couples where id = public.my_couple()
$$;

-- ---------- row level security ----------
alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.days enable row level security;
alter table public.private_items enable row level security;
alter table public.box enable row level security;
alter table public.nudges enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminders_sent enable row level security;

drop policy if exists "profiles: me and partner" on public.profiles;
create policy "profiles: me and partner" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_partner(id));
drop policy if exists "profiles: update me" on public.profiles;
create policy "profiles: update me" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (name, color) on public.profiles to authenticated;

drop policy if exists "days: read me and partner" on public.days;
create policy "days: read me and partner" on public.days for select to authenticated
  using (user_id = auth.uid() or public.is_partner(user_id));
drop policy if exists "days: write me" on public.days;
create policy "days: write me" on public.days for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "days: update me" on public.days;
create policy "days: update me" on public.days for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "private: only me" on public.private_items;
create policy "private: only me" on public.private_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "box: couple reads" on public.box;
create policy "box: couple reads" on public.box for select to authenticated
  using (couple_id = public.my_couple());
drop policy if exists "box: couple adds" on public.box;
create policy "box: couple adds" on public.box for insert to authenticated
  with check (couple_id = public.my_couple() and author = auth.uid());
drop policy if exists "box: couple removes" on public.box;
create policy "box: couple removes" on public.box for delete to authenticated
  using (couple_id = public.my_couple());

drop policy if exists "nudges: mine" on public.nudges;
create policy "nudges: mine" on public.nudges for select to authenticated
  using (to_user = auth.uid() or from_user = auth.uid());
drop policy if exists "nudges: send to partner" on public.nudges;
create policy "nudges: send to partner" on public.nudges for insert to authenticated
  with check (from_user = auth.uid() and couple_id = public.my_couple() and public.is_partner(to_user));
drop policy if exists "nudges: dismiss" on public.nudges;
create policy "nudges: dismiss" on public.nudges for delete to authenticated
  using (to_user = auth.uid());

drop policy if exists "push: only me" on public.push_subscriptions;
create policy "push: only me" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- realtime ----------
do $$ begin
  begin alter publication supabase_realtime add table public.days; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.box; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.nudges; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
end $$;
