-- AI Booth Studio: A/B test counts (views and clicks per version of a page section).
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. (Safe to run again.)
-- Stores no personal data: just the test, the version shown, what happened and a random visitor id.
create table if not exists public.ab_events (
  id         bigserial primary key,
  test       text not null,
  variant    text not null,
  event      text not null,
  visitor    text not null,
  created_at timestamptz not null default now()
);
create index if not exists ab_events_test_idx on public.ab_events (test, variant, event);
alter table public.ab_events enable row level security;
revoke all on public.ab_events from anon, authenticated;
grant all on public.ab_events to service_role;
grant usage, select on sequence public.ab_events_id_seq to service_role;
