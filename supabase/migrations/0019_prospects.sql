-- Compliant PROSPECTS: businesses discovered via the RapidAPI "Local Business
-- Data" search (backend/prospects.py), stored for REVIEW + compliant outreach.
--
-- Deliberately SEPARATE from public.leads: a prospect is something the org found,
-- not someone who reached out. Prospects are NEVER fed into the auto-call sweep
-- (that sweep reads `leads` only). A prospect flows into the normal pipeline
-- exactly once the user explicitly CONVERTS it — at which point a row is inserted
-- into `leads` (source='prospect') and `converted_lead_id` links the two.
--
-- Tenancy is identical to connections / knowledge_base / org_settings: one set of
-- rows per org, visible and writable only to members of that org via RLS
-- (org_id in user_org_ids()). FastAPI talks to it in USER mode on the request
-- path (so RLS is the real boundary) and in SERVICE mode with an explicit org_id
-- only for the public unsubscribe link (no session).

create extension if not exists pgcrypto;

create table if not exists public.prospects (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  name              text not null,
  phone             text,
  email             text,
  address           text,
  website           text,
  category          text,
  rating            numeric,                     -- Google rating (0–5), when present
  review_count      int,                         -- number of reviews, when present
  source            text not null default 'prospect_search',
  status            text not null default 'new'
                      check (status in ('new','contacted','interested','not_interested','converted')),
  notes             text,
  -- Compliant cold-email opt-out. The cold email's unsubscribe link flips this;
  -- a prospect that has unsubscribed can never be emailed again.
  unsubscribed      boolean not null default false,
  -- The provider's stable business_id (Google place). Used, together with
  -- phone/website, to DEDUPE within the org so re-running a search doesn't
  -- create duplicate rows.
  external_id       text,
  -- Set when the prospect is converted to a lead; links to that leads row.
  converted_lead_id uuid references public.leads(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists prospects_org_created_idx on public.prospects (org_id, created_at desc);
create index if not exists prospects_org_status_idx  on public.prospects (org_id, status);
-- Speed up the org-scoped dedupe lookups (phone / website / external_id).
create index if not exists prospects_org_phone_idx    on public.prospects (org_id, phone);
create index if not exists prospects_org_website_idx  on public.prospects (org_id, website);
create index if not exists prospects_org_external_idx on public.prospects (org_id, external_id);

-- Keep updated_at fresh on every UPDATE (public.touch_updated_at() defined in 0009).
drop trigger if exists prospects_touch_updated_at on public.prospects;
create trigger prospects_touch_updated_at
  before update on public.prospects
  for each row execute function public.touch_updated_at();

-- Table privileges (RLS still decides WHICH rows). Mirrors the 0018 pattern.
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.prospects to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.prospects to service_role;
  end if;
end $do$;

-- Row-level security: strict per-org isolation, identical shape to connections.
alter table public.prospects enable row level security;
drop policy if exists "no_public_access" on public.prospects;
drop policy if exists "org_isolation"    on public.prospects;
create policy "org_isolation" on public.prospects
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));
