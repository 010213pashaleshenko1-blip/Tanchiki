create table if not exists public.room_bot_state (
  room_code text primary key,
  bots jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.room_bot_state enable row level security;

drop policy if exists "room bot state read" on public.room_bot_state;
create policy "room bot state read"
  on public.room_bot_state
  for select
  using (true);

drop policy if exists "room bot state insert" on public.room_bot_state;
create policy "room bot state insert"
  on public.room_bot_state
  for insert
  with check (true);

drop policy if exists "room bot state update" on public.room_bot_state;
create policy "room bot state update"
  on public.room_bot_state
  for update
  using (true)
  with check (true);
