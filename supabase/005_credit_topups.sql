-- AI Booth Studio: extra image and video credits bought on top of a pass.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. (Safe to run again.)

-- One row per paid top-up. The Stripe session is unique, so a resent Stripe notice never adds credits twice.
create table if not exists public.credit_purchases (
  id             uuid primary key default gen_random_uuid(),
  stripe_session text not null unique,
  pass_id        uuid references public.passes (id) on delete set null,
  email          text not null,
  kind           text not null check (kind in ('image', 'video')),
  qty            int  not null check (qty > 0),
  amount_cents   int,
  livemode       boolean not null default false,
  created_at     timestamptz not null default now()
);
alter table public.credit_purchases enable row level security;
revoke all on public.credit_purchases from anon, authenticated;
grant all on public.credit_purchases to service_role;

-- Adds bought credits to a pass.
create or replace function public.add_media_credits(p_pass uuid, p_kind text, p_qty int)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update public.passes
       set images_total = images_total + case when p_kind = 'image' then p_qty else 0 end,
           videos_total = videos_total + case when p_kind = 'video' then p_qty else 0 end
     where id = p_pass and p_qty > 0 and p_kind in ('image', 'video')
    returning 1
  )
  select exists (select 1 from u);
$$;
revoke all on function public.add_media_credits(uuid, text, int) from public, anon, authenticated;
grant execute on function public.add_media_credits(uuid, text, int) to service_role;
