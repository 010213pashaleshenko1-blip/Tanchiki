-- Tanchiki Online MVP
-- Для текущего MVP игровые состояния идут через Supabase Realtime Broadcast/Presence.
-- Таблицы ниже нужны для истории комнат и будущих лидербордов.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  player_name text not null,
  kills integer not null default 0,
  deaths integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.match_results enable row level security;

drop policy if exists "rooms read all" on public.rooms;
create policy "rooms read all"
on public.rooms for select
to anon, authenticated
using (true);

drop policy if exists "rooms insert all" on public.rooms;
create policy "rooms insert all"
on public.rooms for insert
to anon, authenticated
with check (true);

drop policy if exists "match results read all" on public.match_results;
create policy "match results read all"
on public.match_results for select
to anon, authenticated
using (true);

drop policy if exists "match results insert all" on public.match_results;
create policy "match results insert all"
on public.match_results for insert
to anon, authenticated
with check (true);
