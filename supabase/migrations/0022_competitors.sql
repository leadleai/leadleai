-- COMPETITOR / MARKET INTELLIGENCE.
--
-- An org adds COMPETITORS (name + website). On a schedule — and on demand via a
-- "check now" button — the backend asks Anthropic, WITH THE WEB SEARCH TOOL, to
-- find recent news / offers / pricing / activity about each competitor and
-- summarise it into a clean INSIGHT (summary + key points + source URLs). Insights
-- are stored so the Market Watch dashboard can show the latest one per competitor.
--
-- The AI call is the ONLY thing that costs money, so it is capped per-org per
-- month (org_settings.competitor_max_per_month) exactly like the prospect-search
-- sweep. Each stored insight == one billed AI run, so the monthly usage count is
-- simply count(competitor_insights) for the org since the start of the calendar
-- month — no separate run-log table needed.
--
-- GRACEFUL DORMANCY: none of this schema depends on ANTHROPIC_API_KEY. The tables,
-- CRUD and RLS work with or without the key; when the key is absent the backend
-- analysis returns a "not configured" message instead of writing an insight.
--
-- Tenancy is identical to prospects / saved_searches / org_settings: one set of
-- rows per org, visible and writable only to members of that org via RLS (org_id
-- in user_org_ids()). FastAPI talks to these in USER mode on the request path (RLS
-- is the real boundary) and in SERVICE mode with an explicit org_id from the sweep.

create extension if not exists pgcrypto;

-- ── 1. competitors ───────────────────────────────────────────────────────────
create table if not exists public.competitors (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  website         text,
  notes           text,
  is_active       boolean     not null default true,
  -- When the sweep (or a manual "check now") last analysed this competitor.
  -- NULL = never checked, so it's due at once.
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists competitors_org_created_idx on public.competitors (org_id, created_at desc);
-- The sweep fetches active competitors per org; a partial index keeps that cheap.
create index if not exists competitors_org_active_idx  on public.competitors (org_id) where is_active;

-- Keep updated_at fresh on every UPDATE (public.touch_updated_at() defined in 0009).
drop trigger if exists competitors_touch_updated_at on public.competitors;
create trigger competitors_touch_updated_at
  before update on public.competitors
  for each row execute function public.touch_updated_at();

-- ── 2. competitor_insights ───────────────────────────────────────────────────
-- One row per AI analysis of a competitor. `details` holds the structured
-- breakdown (key points, model, etc.) and `source_urls` the web-search citations,
-- both jsonb so the shape can evolve without a migration.
create table if not exists public.competitor_insights (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  summary       text not null,
  details       jsonb not null default '{}'::jsonb,   -- { key_points:[...], model, ... }
  source_urls   jsonb not null default '[]'::jsonb,    -- [ { url, title }, ... ]
  created_at    timestamptz not null default now()
);

-- "Latest insight per competitor" and "this org's insights this month" are the
-- two hot reads; index (competitor, time) and (org, time) to serve both cheaply.
create index if not exists competitor_insights_competitor_created_idx
  on public.competitor_insights (competitor_id, created_at desc);
create index if not exists competitor_insights_org_created_idx
  on public.competitor_insights (org_id, created_at desc);

-- ── 3. per-org competitor-intel settings (added to org_settings) ─────────────
-- Read LIVE by the sweep (org_settings.resolve_all), so a dashboard edit takes
-- effect on the very next sweep with no restart — same as every other knob here.
alter table public.org_settings
  add column if not exists competitor_intel_enabled boolean not null default false;

alter table public.org_settings
  add column if not exists competitor_check_frequency_hours integer not null default 168  -- weekly
    check (competitor_check_frequency_hours between 6 and 744);   -- every 6h … once a month

alter table public.org_settings
  add column if not exists competitor_max_per_month integer not null default 100          -- AI runs/month cap
    check (competitor_max_per_month between 0 and 5000);

-- ── Table privileges (RLS still decides WHICH rows) ──────────────────────────
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.competitors         to authenticated;
    -- Insights are WRITTEN by the request path (manual "check now", USER mode) and
    -- by the SERVICE-mode sweep; members read their own org's rows either way.
    grant select, insert, delete          on public.competitor_insights to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.competitors         to service_role;
    grant all on public.competitor_insights to service_role;
  end if;
end $do$;

-- ── Row-level security: strict per-org isolation (identical shape to prospects) ─
alter table public.competitors enable row level security;
drop policy if exists "org_isolation" on public.competitors;
create policy "org_isolation" on public.competitors
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

alter table public.competitor_insights enable row level security;
drop policy if exists "org_isolation" on public.competitor_insights;
create policy "org_isolation" on public.competitor_insights
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));
