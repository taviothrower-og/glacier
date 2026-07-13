-- Glacier cloud sync schema. Run this once in the new Supabase project's SQL editor.
-- One row per (user, key). Glacier uses two keys: 'glacier_main' and 'glacier_inspo'.

create table if not exists public.app_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.app_data enable row level security;

create policy "select own rows" on public.app_data
  for select using (auth.uid() = user_id);
create policy "insert own rows" on public.app_data
  for insert with check (auth.uid() = user_id);
create policy "update own rows" on public.app_data
  for update using (auth.uid() = user_id);
create policy "delete own rows" on public.app_data
  for delete using (auth.uid() = user_id);

-- Push notification device registry: one row per (user, device endpoint).
-- The reminder server (api/tick.js) reads these with the service role key.
create table if not exists public.push_subs (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  sub jsonb not null,
  tz text not null default 'America/Los_Angeles',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

alter table public.push_subs enable row level security;

create policy "select own subs" on public.push_subs
  for select using (auth.uid() = user_id);
create policy "insert own subs" on public.push_subs
  for insert with check (auth.uid() = user_id);
create policy "update own subs" on public.push_subs
  for update using (auth.uid() = user_id);
create policy "delete own subs" on public.push_subs
  for delete using (auth.uid() = user_id);
