-- AI Booth Design: AI Render (photo-realistic images and videos), their credits, and where results are stored.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. (Safe to run again.)

-- One row per image or video a customer asks for.
create table if not exists public.renders (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users (id) on delete cascade,
  pass_id     uuid references public.passes (id) on delete set null,
  kind        text not null check (kind in ('image', 'video')),
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  model       text not null,
  fal_request text,
  prompt      text,
  result_url  text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists renders_owner_idx on public.renders (owner, created_at desc);

alter table public.renders enable row level security;
drop policy if exists "read own renders" on public.renders;
create policy "read own renders" on public.renders for select to authenticated using (owner = auth.uid());
revoke all on public.renders from anon, authenticated;
grant select on public.renders to authenticated;   -- customers only read; the server creates and updates
grant all on public.renders to service_role;

-- Takes one image or video credit from a pass, only if it is active and has one left. True when taken.
create or replace function public.use_media_credit(p_pass uuid, p_kind text)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update public.passes
       set images_used = images_used + case when p_kind = 'image' then 1 else 0 end,
           videos_used = videos_used + case when p_kind = 'video' then 1 else 0 end
     where id = p_pass and ends_at > now()
       and ((p_kind = 'image' and images_used < images_total) or (p_kind = 'video' and videos_used < videos_total))
    returning 1
  )
  select exists (select 1 from u);
$$;

-- Gives a credit back when a render fails.
create or replace function public.refund_media_credit(p_pass uuid, p_kind text)
returns void language sql security definer set search_path = public as $$
  update public.passes
     set images_used = greatest(0, images_used - case when p_kind = 'image' then 1 else 0 end),
         videos_used = greatest(0, videos_used - case when p_kind = 'video' then 1 else 0 end)
   where id = p_pass;
$$;

revoke all on function public.use_media_credit(uuid, text) from public, anon, authenticated;
revoke all on function public.refund_media_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.use_media_credit(uuid, text) to service_role;
grant execute on function public.refund_media_credit(uuid, text) to service_role;

-- Finished images and videos are copied here, so they last after the AI service's own links expire.
-- Public bucket: each file sits at an unguessable path (owner id / render id).
insert into storage.buckets (id, name, public) values ('renders', 'renders', true)
on conflict (id) do nothing;
