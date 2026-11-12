-- AI Booth Studio: refunds. A full refund in Stripe ends the pass, or takes back the extras that were bought.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. (Safe to run again.)
-- refunded_at marks what has already been handled, so a repeated Stripe notice never takes anything twice.
alter table public.passes add column if not exists refunded_at timestamptz;
alter table public.credit_purchases add column if not exists refunded_at timestamptz;
