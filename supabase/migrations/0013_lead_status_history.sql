-- Status-change history for a lead's activity timeline.
--
-- Until now a lead only carried its CURRENT status; a change overwrote the old
-- value with no record of when it happened. The lead detail page wants a
-- chronological "what happened to this lead" feed, so from here on every status
-- transition made through PATCH /api/leads/{id} appends one immutable row here.
-- The initial 'new' status is not recorded — the lead's own created_at already
-- anchors the timeline as the enquiry-submission event.
--
-- Org-scoped exactly like leads/call_log/email_log (0008): a row is visible only
-- to members of its org, enforced by RLS, not by application code alone.

create extension if not exists pgcrypto;

create table if not exists public.lead_status_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  from_status text,                       -- null for the very first recorded change
  to_status   text not null,
  -- Who made the change. Null when it came from a background job (no session).
  changed_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists lead_status_history_lead_idx
  on public.lead_status_history (lead_id, created_at desc);
create index if not exists lead_status_history_org_idx
  on public.lead_status_history (org_id);

-- Table-level privileges (RLS decides which rows; GRANT decides table access).
-- anon is deliberately excluded — the browser reaches this only through FastAPI.
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert on public.lead_status_history to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.lead_status_history to service_role;
  end if;
end $do$;

-- One permissive policy: you may touch a row only when its org is one of yours.
alter table public.lead_status_history enable row level security;
drop policy if exists "org_isolation" on public.lead_status_history;
create policy "org_isolation" on public.lead_status_history
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));
