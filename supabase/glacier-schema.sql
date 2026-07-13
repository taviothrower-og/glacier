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
