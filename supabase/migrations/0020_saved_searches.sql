-- SCHEDULED / AUTOMATED PROSPECT SEARCHES.
--
-- A `saved_searches` row is a category+location query an org wants re-run on a
-- schedule. The background sweep (backend/prospects.py run_prospect_search_sweep,
-- driven by Cloud Scheduler → POST /api/cron/prospect-search-sweep) walks every
-- org whose org_settings.prospect_search_enabled is true and, for each active
-- saved search whose own prospect_search_frequency_hours has elapsed since
-- last_run_at, runs it through the SAME RapidAPI "Local Business Data" search the
-- manual Prospects page uses. New businesses are inserted into public.prospects
-- (deduped on business_id/phone/website); existing ones are left as-is.
--
-- IMPORTANT — this only DISCOVERS prospects. It never auto-contacts, auto-emails
-- or auto-calls anyone: discovered rows land as status 'new' in `prospects`, and
-- review / cold-email / convert stays exactly as manual as before.
--
-- Two companion pieces live in this migration:
--   1. three prospect_search_* columns on public.org_settings — the per-org
--      timing + monthly cap the sweep reads LIVE (same live-settings mechanism as
--      every other automation knob), and
--   2. public.prospect_search_runs — one row per executed automated search, so
--      the monthly-quota check and the usage endpoint have an accurate count.
--
-- Tenancy is identical to prospects / org_settings: one set of rows per org,
-- visible and writable only to members of that org via RLS (org_id in
-- user_org_ids()). FastAPI talks to these in USER mode on the request path (RLS is
-- the real boundary) and in SERVICE mode with an explicit org_id from the sweep.

create extension if not exists pgcrypto;

-- ── 1. saved_searches ────────────────────────────────────────────────────────
create table if not exists public.saved_searches (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  -- The resolved free-text query the RapidAPI search runs (e.g. "salons in
  -- Mumbai"). category/location are kept alongside so the UI can show/edit the
  -- parts; the sweep prefers `query` and falls back to "category in location".
  query         text not null,
  location      text,
  category      text,
  is_active     boolean     not null default true,
  -- When the sweep last ran THIS search. NULL = never run (so it's due at once).
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists saved_searches_org_created_idx on public.saved_searches (org_id, created_at desc);
-- The sweep fetches active searches per org; a partial index keeps that cheap.
create index if not exists saved_searches_org_active_idx  on public.saved_searches (org_id) where is_active;

drop trigger if exists saved_searches_touch_updated_at on public.saved_searches;
create trigger saved_searches_touch_updated_at
  before update on public.saved_searches
  for each row execute function public.touch_updated_at();

-- ── 2. per-org automated-search settings (added to org_settings) ─────────────
-- Read LIVE by the sweep (org_settings.resolve_all), so a dashboard edit takes
-- effect on the very next sweep with no restart — same as every other knob here.
alter table public.org_settings
  add column if not exists prospect_search_enabled boolean not null default false;

alter table public.org_settings
  add column if not exists prospect_search_frequency_hours integer not null default 168  -- weekly
    check (prospect_search_frequency_hours between 6 and 744);   -- every 6h … once a month

alter table public.org_settings
  add column if not exists prospect_search_max_per_month integer not null default 100     -- searches/month cap
    check (prospect_search_max_per_month between 0 and 500);      -- ≤ the RapidAPI free tier

-- ── 3. prospect_search_runs (usage log; drives the monthly quota + UI) ───────
-- One row per automated saved-search execution == one upstream RapidAPI call.
-- Monthly usage = count(rows) for the org since the start of the calendar month.
create table if not exists public.prospect_search_runs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  -- The search that ran. NULL if the saved search was later deleted — the usage
  -- row survives so a mid-month deletion can't reset the quota.
  saved_search_id uuid references public.saved_searches(id) on delete set null,
  query           text,
  found           integer not null default 0,    -- businesses the API returned
  stored          integer not null default 0,    -- brand-new prospects inserted
  created_at      timestamptz not null default now()
);

-- The quota count is "this org's runs since <month start>", so index (org, time).
create index if not exists prospect_search_runs_org_created_idx
  on public.prospect_search_runs (org_id, created_at desc);

-- ── Table privileges (RLS still decides WHICH rows) ──────────────────────────
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.saved_searches      to authenticated;
    -- Usage rows are written only by the SERVICE-mode sweep; the request path
    -- only ever reads its own org's rows (for the usage endpoint).
    grant select                          on public.prospect_search_runs to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.saved_searches      to service_role;
    grant all on public.prospect_search_runs to service_role;
  end if;
end $do$;

-- ── Row-level security: strict per-org isolation (identical shape to prospects) ─
alter table public.saved_searches enable row level security;
drop policy if exists "org_isolation" on public.saved_searches;
create policy "org_isolation" on public.saved_searches
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

alter table public.prospect_search_runs enable row level security;
drop policy if exists "org_isolation_read" on public.prospect_search_runs;
-- Read-only for members; inserts come from the service role (RLS-bypassing), so
-- there is deliberately no authenticated INSERT/UPDATE/DELETE policy.
create policy "org_isolation_read" on public.prospect_search_runs
  for select to authenticated
  using (org_id in (select public.user_org_ids()));
