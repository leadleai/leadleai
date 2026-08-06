-- AI calling agents. Each org designs one or more named voice agents (voice,
-- greeting, persona/script, temperature, etc.); a call is placed *as* an agent,
-- and the org's DEFAULT agent is used for auto-calls.
--
-- Same tenancy rule as leads/knowledge_base/lead_tags (0008/0009/0014): a row is
-- visible and writable only to members of its own org —
-- org_id in (select public.user_org_ids()) — enforced by RLS, not by the API
-- alone. The dashboard talks to this table in USER mode (the caller's JWT), so
-- RLS is the real boundary. Background auto-call reads it in SERVICE mode with an
-- explicit org_id.
--
-- provider names the calling backend the agent runs on ('bland' for now). It's a
-- plain string, not an enum, so a new provider adapter (vapi/retell/exotel) is a
-- data change, not a schema migration. Provider-specific knobs that don't warrant
-- a column live in extra_params (jsonb), merged into the provider payload as-is.

create extension if not exists pgcrypto;

create table if not exists public.agents (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  name               text not null check (char_length(trim(name)) between 1 and 80),
  provider           text not null default 'bland'
                     check (char_length(trim(provider)) between 1 and 40),
  voice              text,                                   -- provider voice id (e.g. Bland 'maya')
  language           text not null default 'en',
  first_message      text not null default '',              -- greeting / opening line
  persona_prompt     text not null default '',              -- script + personality -> the call task
  use_knowledge_base boolean not null default false,        -- inject the org KB into the prompt
  temperature        numeric not null default 0.7
                     check (temperature >= 0 and temperature <= 1),
  max_duration       integer not null default 5             -- minutes
                     check (max_duration between 1 and 60),
  extra_params       jsonb not null default '{}'::jsonb,    -- passthrough provider params
  is_active          boolean not null default true,
  is_default         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists agents_org_idx
  on public.agents (org_id, created_at desc);
-- Fast "the org's default agent" lookup (partial: only the default rows).
create index if not exists agents_org_default_idx
  on public.agents (org_id) where is_default;

-- Keep updated_at fresh on every UPDATE (function defined in 0009).
drop trigger if exists agents_touch_updated_at on public.agents;
create trigger agents_touch_updated_at
  before update on public.agents
  for each row execute function public.touch_updated_at();

-- ── Table-level privileges ───────────────────────────────────────────────────
-- RLS decides which rows; GRANT decides table access. anon is deliberately
-- excluded — the browser reaches this only through FastAPI in USER mode
-- (authenticated) or via the service role for background auto-calls.
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.agents to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.agents to service_role;
  end if;
end $do$;

-- ── Row-level security: strict per-org isolation ─────────────────────────────
-- One permissive policy: you may touch a row only when its org is one of yours.
-- Identical shape to the leads/knowledge_base policies.
alter table public.agents enable row level security;
drop policy if exists "org_isolation" on public.agents;
create policy "org_isolation" on public.agents
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));
