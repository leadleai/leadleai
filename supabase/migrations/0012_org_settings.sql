-- Per-org automation settings.
--
-- Until now every automation knob (auto-call on/off, quiet hours, the call delay,
-- the dedupe window, follow-ups on/off, the follow-up schedule, the AI-agent name,
-- KB matching, AI emails, and how often the sweeps run) was a PROCESS-GLOBAL env
-- var — one value shared by every tenant on the deployment. This table makes each
-- of those PER-ORG, editable from the dashboard, and read LIVE by the background
-- sweeps so a change takes effect on the very next sweep with no restart.
--
-- Tenancy is identical to leads / knowledge_base: exactly one row per org, visible
-- and writable only to members of that org via RLS (org_id in user_org_ids()). The
-- dashboard talks to this table through FastAPI in USER mode, so RLS — not the API
-- — is the real boundary. The sweeps read it in SERVICE mode with explicit org_ids.
--
-- Every column defaults to the same value the old env var defaulted to, so an org
-- with a freshly-seeded row behaves exactly as the global defaults did before —
-- except follow-up timing, whose default is the sensible production schedule
-- [24, 72, 168] hours (day 1 / 3 / 7) rather than the fast in-code test values.

create extension if not exists pgcrypto;

create table if not exists public.org_settings (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null unique
                             references public.organizations(id) on delete cascade,

  -- ── Auto-call ──────────────────────────────────────────────────────────────
  auto_call_enabled        boolean     not null default false,   -- AUTO_CALL_ENABLED
  auto_call_delay_seconds  integer     not null default 45        -- AUTO_CALL_DELAY_SECONDS
                             check (auto_call_delay_seconds between 0 and 86400),
  dedupe_minutes           integer     not null default 60        -- AUTO_CALL_DEDUPE_MINUTES
                             check (dedupe_minutes between 0 and 10080),

  -- ── Quiet hours (shared by auto-call AND follow-ups) ─────────────────────────
  quiet_start              text        not null default '09:00',  -- AUTO_CALL_QUIET_START  (HH:MM)
  quiet_end                text        not null default '20:00',  -- AUTO_CALL_QUIET_END    (HH:MM)
  timezone                 text        not null default 'Asia/Kolkata', -- AUTO_CALL_TIMEZONE

  -- ── Follow-up email drip ─────────────────────────────────────────────────────
  followup_enabled         boolean     not null default false,   -- FOLLOWUP_ENABLED
  followup_from_email      text,                                  -- FOLLOWUP_FROM_EMAIL (null -> env)
  -- Hours after created_at for each of the (up to 3) follow-ups. numeric[] so the
  -- UI can also set sub-hour values for testing. Default = day 1 / 3 / 7.
  followup_schedule_hours  numeric[]   not null default '{24,72,168}'
                             check (
                               array_length(followup_schedule_hours, 1) between 1 and 3
                             ),

  -- ── Content behaviour ────────────────────────────────────────────────────────
  agent_name               text        not null default 'Ava',   -- AGENT_NAME (voice agent)
  kb_matching_enabled      boolean     not null default true,     -- KB_MATCHING_ENABLED
  ai_emails_enabled        boolean     not null default false,    -- AI_EMAILS_ENABLED

  -- ── Sweep frequency (how often the checker runs, per org) ────────────────────
  -- NOTE (honest limitation, see backend/scheduler.py): the internal scheduler is
  -- a single shared loop, so an org can never be checked MORE often than the loop
  -- ticks. The loop adapts down to the smallest configured interval across all
  -- orgs (floored by *_SWEEP_MIN_SECONDS), and within each pass an org is only
  -- actually processed once its own interval has elapsed. So larger-than-tick
  -- values are honoured precisely; values smaller than the floor are clamped up.
  auto_call_sweep_seconds  integer     not null default 60        -- AUTO_CALL_SWEEP_INTERVAL_SECONDS
                             check (auto_call_sweep_seconds between 5 and 86400),
  followup_sweep_seconds   integer     not null default 60        -- FOLLOWUP_INTERVAL_MINUTES * 60
                             check (followup_sweep_seconds between 5 and 86400),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists org_settings_org_idx on public.org_settings (org_id);

-- Keep updated_at fresh on every UPDATE (public.touch_updated_at() defined in 0009).
drop trigger if exists org_settings_touch_updated_at on public.org_settings;
create trigger org_settings_touch_updated_at
  before update on public.org_settings
  for each row execute function public.touch_updated_at();

-- Table privileges (RLS still decides WHICH rows). Mirrors the 0008/0009 pattern.
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.org_settings to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.org_settings to service_role;
  end if;
end $do$;

-- Row-level security: strict per-org isolation, identical shape to knowledge_base.
alter table public.org_settings enable row level security;
drop policy if exists "no_public_access" on public.org_settings;
drop policy if exists "org_isolation"    on public.org_settings;
create policy "org_isolation" on public.org_settings
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

-- ── Auto-provision a settings row for every NEW org ──────────────────────────
-- So a tenant always has a row without the app having to create one lazily. The
-- backend also upserts on demand, so a missing row is never fatal — this is just
-- the tidy default path. SECURITY DEFINER so it runs regardless of who inserts.
create or replace function public.create_org_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.org_settings (org_id)
  values (new.id)
  on conflict (org_id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists organizations_create_settings on public.organizations;
create trigger organizations_create_settings
  after insert on public.organizations
  for each row execute function public.create_org_settings();

-- ── Seed a default row for every EXISTING org (from the old env-var defaults) ──
-- Column defaults supply the values, so each org starts out behaving exactly as
-- the global defaults did. Re-runnable: on conflict do nothing.
insert into public.org_settings (org_id)
select id from public.organizations
on conflict (org_id) do nothing;
