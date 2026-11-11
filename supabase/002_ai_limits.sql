-- AI Booth Design: AI action limits per pass.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run.
-- (Run after schema.sql. Safe to run again.)

alter table public.passes add column if not exists ai_total integer not null default 0;
alter table public.passes add column if not exists ai_used  integer not null default 0 check (ai_used >= 0);

-- Give passes bought before this change their plan's allowance.
update public.passes set ai_total = case plan when 'week' then 50 when 'month' then 150 when 'year' then 450 end
where ai_total = 0;

-- Uses one AI action on a pass, only if it is still active and has actions left.
-- Returns true when an action was used. One statement, so two requests can't both take the last action.
create or replace function public.use_ai_action(p_pass uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with u as (
    update public.passes
       set ai_used = ai_used + 1
     where id = p_pass and ends_at > now() and ai_used < ai_total
    returning 1
  )
  select exists (select 1 from u);
$$;

-- Only the server (secret key) may call it.
revoke all on function public.use_ai_action(uuid) from public, anon, authenticated;
grant execute on function public.use_ai_action(uuid) to service_role;
