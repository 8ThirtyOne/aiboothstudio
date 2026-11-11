-- AI Booth Design: designs saved to customer accounts, with optional share links.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. (Safe to run again.)

create table if not exists public.designs (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Untitled design' check (char_length(name) <= 80),
  data        jsonb not null check (octet_length(data::text) < 2000000),
  thumb       text check (thumb is null or octet_length(thumb) < 200000),
  share_token text unique check (share_token is null or share_token ~ '^[A-Za-z0-9_-]{20,64}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists designs_owner_idx on public.designs (owner, updated_at desc);

alter table public.designs enable row level security;

-- Each signed-in customer can see and change only their own designs.
drop policy if exists "own designs" on public.designs;
create policy "own designs" on public.designs
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- Shared designs are served by the website's server (secret key), never read directly by visitors.
revoke all on public.designs from anon, authenticated;
grant select, insert, update, delete on public.designs to authenticated;
grant all on public.designs to service_role;
