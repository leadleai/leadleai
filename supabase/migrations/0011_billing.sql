-- Razorpay billing: plans catalogue + per-org subscriptions.
--
-- NOTE (2026-07-27): as of this migration there is NO backend billing code in
-- the repo (no razorpay client, no /billing endpoints, no webhook handler). This
-- schema is written from a spec, not reverse-engineered from working code, so the
-- table/column names below are the source of truth for whatever billing code gets
-- written next -- not the other way around. The seed rows and razorpay_* ids are
-- PLACEHOLDERS (see the INSERT block) and must be replaced with real values from
-- the Razorpay dashboard before go-live.
--
-- Tenancy follows the same rule as every other tenant table (leads, email_log,
-- knowledge_base): a subscription row is visible only to members of its own org
-- via org_id in (select public.user_org_ids()). Writes are reserved for the
-- service role -- FastAPI mutates subscriptions in SERVICE mode from the Razorpay
-- webhook, never the browser. `plans` is a global catalogue readable by any
-- signed-in user. Idempotent: safe to re-run.

create extension if not exists pgcrypto;

-- ── plans: global catalogue (not org-scoped) ────────────────────────────────
create table if not exists public.plans (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  razorpay_plan_id text not null unique,
  price_inr        integer,                        -- nullable: "Custom"/Enterprise has no fixed price
  interval         text not null default 'monthly',
  perks            jsonb not null default '[]'::jsonb,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create index if not exists plans_active_idx on public.plans (is_active);

-- ── subscriptions: one active row per org, driven by Razorpay webhooks ───────
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  plan_id                  uuid not null references public.plans(id),
  razorpay_subscription_id text unique,
  razorpay_customer_id     text,
  status                   text not null default 'created',
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists subscriptions_org_idx  on public.subscriptions (org_id);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);

-- Keep updated_at fresh on every UPDATE. Reuses public.touch_updated_at()
-- defined in 0009_knowledge_base.sql (runs before this migration).
drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ── Row-level security ──────────────────────────────────────────────────────
-- plans: readable by any authenticated user; writes are service-role only
-- (service_role bypasses RLS, so the absence of a write policy is the lock).
alter table public.plans enable row level security;
drop policy if exists "plans_read_all" on public.plans;
create policy "plans_read_all" on public.plans
  for select to authenticated
  using (true);

-- subscriptions: org members read their own org's row; writes are service-role
-- only. Same helper (user_org_ids) as leads/knowledge_base, restricted to SELECT.
alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_org_read" on public.subscriptions;
create policy "subscriptions_org_read" on public.subscriptions
  for select to authenticated
  using (org_id in (select public.user_org_ids()));

-- ── Table grants ────────────────────────────────────────────────────────────
-- Grants are per-table in this project (see 0008), so new tables need their own.
-- authenticated gets SELECT only (RLS narrows the rows); every write goes through
-- service_role. anon gets nothing.
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.plans, public.subscriptions to authenticated;
  else
    raise notice 'role "authenticated" not found — skipping grants (expected outside Supabase)';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.plans, public.subscriptions to service_role;
  end if;
end $do$;

-- ── Seed the 3 plans ────────────────────────────────────────────────────────
-- PLACEHOLDERS: names/perks mirror the marketing pricing (Starter/Growth/
-- Enterprise in frontend/src/lib/mockData.js), but that page quotes USD ($99/
-- $399/Custom) while this table stores INR. The razorpay_plan_id values and the
-- price_inr amounts below are NOT real — replace them with the actual plan ids
-- and INR prices from the Razorpay dashboard. ON CONFLICT keeps re-runs safe and
-- refreshes the mutable columns without touching each plan's id.
insert into public.plans (name, razorpay_plan_id, price_inr, interval, perks, is_active) values
  ('Starter',    'plan_REPLACE_ME_starter',    NULL, 'monthly',
     '["500 AI-found leads/mo","AI email outreach","Basic CRM sync","Email support"]'::jsonb, true),
  ('Growth',     'plan_REPLACE_ME_growth',     NULL, 'monthly',
     '["5,000 AI-found leads/mo","AI email + call agents","Full CRM automation","Meeting scheduler","Analytics dashboard","Priority support"]'::jsonb, true),
  ('Enterprise', 'plan_REPLACE_ME_enterprise', NULL, 'monthly',
     '["Unlimited leads","Dedicated AI employees","Custom integrations","SSO & advanced security","Dedicated success manager","SLA guarantee"]'::jsonb, true)
on conflict (razorpay_plan_id) do update set
  name      = excluded.name,
  price_inr = excluded.price_inr,
  interval  = excluded.interval,
  perks     = excluded.perks,
  is_active = excluded.is_active;
