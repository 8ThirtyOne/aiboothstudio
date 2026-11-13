-- AI Booth Studio: handy admin queries for the Supabase SQL Editor.
-- These are NOT setup scripts. Run one query at a time: select the lines you want, then Run (Cmd+Enter).
-- Replace customer@example.com with the customer's email.
--
-- Setup scripts, in the order they were run: schema.sql, 002_ai_limits.sql, 003_designs.sql, 004_renders.sql,
-- 005_credit_topups.sql, 006_ai_topups.sql, 007_refunds.sql. Run them again, in that order, only when setting up a new database.


-- ── Look up a customer ─────────────────────────────────────────────

-- All passes for a customer, newest first, with what's left
select plan, starts_at, ends_at, refunded_at, livemode,
       ai_total - ai_used         as ai_build_left, ai_total,
       images_total - images_used as images_left,   images_total,
       videos_total - videos_used as videos_left,   videos_total,
       id
from public.passes
where email = lower('customer@example.com')
order by ends_at desc;

-- Extras a customer bought (images, videos, AI Build actions)
select created_at, kind, qty, amount_cents, livemode, refunded_at, pass_id
from public.credit_purchases
where email = lower('customer@example.com')
order by created_at desc;

-- A customer's AI Render images and videos
select r.created_at, r.kind, r.status, r.result_url, r.error
from public.renders r join auth.users u on u.id = r.owner
where u.email = lower('customer@example.com')
order by r.created_at desc;


-- ── Give a customer more (comps, make-goods) ──────────────────────
-- Each adds to the customer's current pass (the active one that ends last).

-- Add 10 AI Build actions
select public.add_ai_actions(
  (select id from public.passes where email = lower('customer@example.com') and ends_at > now() order by ends_at desc limit 1),
  10);

-- Add 2 AI Render images  (change 'image' to 'video' for 10-second videos)
select public.add_media_credits(
  (select id from public.passes where email = lower('customer@example.com') and ends_at > now() order by ends_at desc limit 1),
  'image', 2);

-- Extend the current pass by 7 days
update public.passes set ends_at = ends_at + interval '7 days'
where id = (select id from public.passes where email = lower('customer@example.com') and ends_at > now() order by ends_at desc limit 1)
returning plan, ends_at;


-- ── End or fix access ──────────────────────────────────────────────

-- End a customer's current pass now (refunds in Stripe already do this automatically)
update public.passes set ends_at = now()
where id = (select id from public.passes where email = lower('customer@example.com') and ends_at > now() order by ends_at desc limit 1)
returning plan, ends_at;


-- ── Business overview ──────────────────────────────────────────────

-- Live sales by pass type (excludes test purchases and refunds)
select plan, count(*) as passes, sum(amount_cents) / 100.0 as revenue_usd
from public.passes
where livemode and refunded_at is null
group by plan order by revenue_usd desc;

-- Live extras sold (excludes test purchases and refunds)
select kind, count(*) as purchases, sum(qty) as units, sum(amount_cents) / 100.0 as revenue_usd
from public.credit_purchases
where livemode and refunded_at is null
group by kind;

-- Active passes right now
select plan, count(*) from public.passes where ends_at > now() and livemode group by plan;

-- AI Render use in the last 30 days
select kind, status, count(*) from public.renders
where created_at > now() - interval '30 days'
group by kind, status order by kind, status;


-- ── A/B tests ──────────────────────────────────────────────────────

-- Hero test results: unique visitors who saw each version, and how many of them took each action.
-- A = "Showcase your booth vision with ease"   B = "See your trade show presence before it's built"
-- Give it at least a few hundred visitors per version before trusting a difference.
with v as (
  select variant, visitor,
         bool_or(event = 'view')      as saw,
         bool_or(event = 'hero_cta')  as hero_cta,
         bool_or(event = 'open_app')  as open_app,
         bool_or(event = 'buy_click') as buy_click,
         bool_or(event = 'contact')   as contact
  from public.ab_events where test = 'hero1' group by variant, visitor
)
select variant,
       count(*) filter (where saw)                                    as visitors,
       count(*) filter (where saw and hero_cta)                       as clicked_hero_button,
       round(100.0 * count(*) filter (where saw and hero_cta)  / nullif(count(*) filter (where saw), 0), 1) as hero_button_pct,
       round(100.0 * count(*) filter (where saw and open_app)  / nullif(count(*) filter (where saw), 0), 1) as opened_studio_pct,
       round(100.0 * count(*) filter (where saw and buy_click) / nullif(count(*) filter (where saw), 0), 1) as started_checkout_pct,
       count(*) filter (where saw and contact)                        as contact_forms
from v group by variant order by variant;
