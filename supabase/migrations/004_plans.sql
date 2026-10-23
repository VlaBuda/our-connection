-- Update 4: "Наш час" — planning things to do together (game, watching, call...).
-- Run once in Supabase → SQL Editor → New query → paste → Run.

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author uuid not null references auth.users on delete cascade default auth.uid(),
  kind text not null default 'other' check (kind in ('game','watch','call','other')),
  title text not null check (char_length(title) between 1 and 200),
  at timestamptz,                 -- empty = just an idea, no time yet
  proposed_by uuid references auth.users on delete set null default auth.uid(), -- who set the current time
  agreed_at timestamptz,          -- the other person said "Я за"
  agreed_by uuid references auth.users on delete set null,
  done_at timestamptz,            -- happened, goes to history
  created_at timestamptz not null default now()
);
alter table public.plans enable row level security;

drop policy if exists "plans: couple reads" on public.plans;
create policy "plans: couple reads" on public.plans for select to authenticated
  using (couple_id = public.my_couple());
drop policy if exists "plans: couple adds" on public.plans;
create policy "plans: couple adds" on public.plans for insert to authenticated
  with check (couple_id = public.my_couple() and author = auth.uid());
drop policy if exists "plans: couple updates" on public.plans;
create policy "plans: couple updates" on public.plans for update to authenticated
  using (couple_id = public.my_couple()) with check (couple_id = public.my_couple());
revoke update on public.plans from authenticated;
grant update (kind, title, at, proposed_by, agreed_at, agreed_by, done_at) on public.plans to authenticated;
drop policy if exists "plans: couple removes" on public.plans;
create policy "plans: couple removes" on public.plans for delete to authenticated
  using (couple_id = public.my_couple());

do $$ begin
  begin alter publication supabase_realtime add table public.plans; exception when duplicate_object then null; end;
end $$;
