-- AI Booth Studio: extra AI Build actions bought on top of a pass (packs of 10).
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. (Safe to run again.)

-- Top-up purchases can now also be AI Build actions.
alter table public.credit_purchases drop constraint if exists credit_purchases_kind_check;
alter table public.credit_purchases add constraint credit_purchases_kind_check check (kind in ('image', 'video', 'ai'));

-- Adds bought AI Build actions to a pass.
create or replace function public.add_ai_actions(p_pass uuid, p_qty int)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update public.passes set ai_total = ai_total + p_qty
     where id = p_pass and p_qty > 0
    returning 1
  )
  select exists (select 1 from u);
$$;
revoke all on function public.add_ai_actions(uuid, int) from public, anon, authenticated;
grant execute on function public.add_ai_actions(uuid, int) to service_role;
