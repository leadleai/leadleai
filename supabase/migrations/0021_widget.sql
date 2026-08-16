-- Embeddable AI chat widget: per-org config, captured conversations, and a
-- monthly message log for cost-capping.
--
-- TENANCY / SECURITY MODEL — two very different callers touch these tables:
--
--   • The DASHBOARD (a signed-in org member) manages config and reads
--     conversations. Those requests run in USER mode, so the org_isolation RLS
--     policies below (org_id in (select public.user_org_ids())) are the real
--     boundary — identical pattern to leads/knowledge_base.
--
--   • The PUBLIC widget endpoints (/api/widget/{widget_key}/message|capture)
--     have NO authenticated user — the visitor is anonymous on someone else's
--     website. FastAPI serves them in SERVICE mode (service-role key, bypasses
--     RLS) and scopes every read/write to the org resolved FROM the widget_key.
--     The widget_key is the ONLY public identifier; it is long and random
--     (unguessable), never a credential that grants dashboard access.
--
-- So: RLS is ENABLED with org-only policies (locking out anon/authenticated
-- cross-org access from the browser), and the backend reaches these tables for
-- public traffic exclusively through the service role.

create extension if not exists pgcrypto;


-- ── widget_config ────────────────────────────────────────────────────────────
-- Exactly one row per org (unique org_id). The widget_key is generated once,
-- server-side, as 48 hex chars of CSPRNG output — unguessable, and safe to embed
-- in a public <script> tag because on its own it only permits chatting with THIS
-- org's bot and submitting a lead to THIS org.
create table if not exists public.widget_config (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null unique references public.organizations(id) on delete cascade,
  widget_key          text not null unique default encode(gen_random_bytes(24), 'hex'),
  is_active           boolean not null default true,
  greeting_message    text not null default 'Hi! 👋 How can I help you today?',
  primary_color       text not null default '#4f46e5',
  -- Which of name/email/phone the capture form collects, as an ordered subset.
  capture_fields      jsonb not null default '["name","email","phone"]'::jsonb,
  -- Hard monthly ceiling on AI replies for this org — the abuse / runaway-cost
  -- stop. When hit, the widget answers with a graceful fallback and calls no API.
  monthly_message_cap integer not null default 1000
                      check (monthly_message_cap >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- widget_key is the public lookup path for every message; keep it fast. (The
-- UNIQUE constraint already builds an index, so this is intentionally omitted.)

-- touch_updated_at() is defined in 0009_knowledge_base.sql.
drop trigger if exists widget_config_touch_updated_at on public.widget_config;
create trigger widget_config_touch_updated_at
  before update on public.widget_config
  for each row execute function public.touch_updated_at();

alter table public.widget_config enable row level security;
drop policy if exists "org_isolation" on public.widget_config;
create policy "org_isolation" on public.widget_config
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));


-- ── widget_conversations ─────────────────────────────────────────────────────
-- One row per visitor session (widget_key + session_id). `messages` is the full
-- transcript as a JSON array of {role, content, at}. Written in SERVICE mode by
-- the public endpoints; read in USER mode by the dashboard (RLS-scoped).
create table if not exists public.widget_conversations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  widget_key        text not null,
  session_id        text not null,
  messages          jsonb not null default '[]'::jsonb,
  visitor_name      text,
  visitor_email     text,
  visitor_phone     text,
  -- Set once the visitor's details are captured into the leads pipeline.
  converted_lead_id uuid references public.leads(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One conversation per (widget_key, session_id) — the upsert key for the public
-- message endpoint.
create unique index if not exists widget_conversations_session_idx
  on public.widget_conversations (widget_key, session_id);
create index if not exists widget_conversations_org_idx
  on public.widget_conversations (org_id, created_at desc);

drop trigger if exists widget_conversations_touch_updated_at on public.widget_conversations;
create trigger widget_conversations_touch_updated_at
  before update on public.widget_conversations
  for each row execute function public.touch_updated_at();

alter table public.widget_conversations enable row level security;
drop policy if exists "org_isolation" on public.widget_conversations;
create policy "org_isolation" on public.widget_conversations
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));


-- ── widget_message_log ───────────────────────────────────────────────────────
-- One row per AI reply, used ONLY to count usage against monthly_message_cap
-- (exact PostgREST count over a month window). Kept separate from the transcript
-- so the cap check is a cheap indexed COUNT, never a JSON scan.
create table if not exists public.widget_message_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  widget_key text not null,
  session_id text,
  created_at timestamptz not null default now()
);

create index if not exists widget_message_log_org_created_idx
  on public.widget_message_log (org_id, created_at desc);

alter table public.widget_message_log enable row level security;
drop policy if exists "org_isolation" on public.widget_message_log;
-- Read-only for the dashboard (usage display); all writes are service-mode.
create policy "org_isolation" on public.widget_message_log
  for select to authenticated
  using (org_id in (select public.user_org_ids()));
