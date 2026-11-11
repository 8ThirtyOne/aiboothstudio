-- AI Booth Studio: accounts database.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run.

-- One row per purchased pass. Rows are written only by the server (Stripe webhook),
-- using the secret key; signed-in customers can read their own rows and nothing else.
create table if not exists public.passes (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  plan           text not null check (plan in ('week', 'month', 'year')),
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz not null,
  images_total   integer not null default 0,
  images_used    integer not null default 0 check (images_used >= 0),
  videos_total   integer not null default 0,
  videos_used    integer not null default 0 check (videos_used >= 0),
  amount_cents   integer,
  livemode       boolean not null default false,
  stripe_session text unique,
  created_at     timestamptz not null default now()
);

create index if not exists passes_email_idx on public.passes (lower(email));

alter table public.passes enable row level security;

-- Customers can see only the passes bought with the email they signed in with.
drop policy if exists "read own passes" on public.passes;
create policy "read own passes" on public.passes
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- No insert, update or delete policies on purpose: only the server can change passes.

-- The project does not expose new tables automatically, so grant access explicitly:
-- signed-in customers may read (filtered by the policy above); the server's secret key may do everything.
revoke all on public.passes from anon, authenticated;
grant select on public.passes to authenticated;
grant all on public.passes to service_role;
