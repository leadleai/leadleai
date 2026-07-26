-- Per-org knowledge base. The org uploads a few plain-text entries once (product
-- facts, pricing, FAQs, policies); the AI follow-up writer is grounded ONLY in
-- these rows so it can answer a lead's enquiry without inventing anything.
--
-- Same tenancy rule as leads/email_log: a row is visible only to members of its
-- own org — org_id in (select public.user_org_ids()) — so a user in another org
-- can never read or write it. The dashboard talks to this table in USER mode, so
-- RLS (not the API) is the real boundary. The follow-up sweep reads it in SERVICE
-- mode with an explicit org_id.

create extension if not exists pgcrypto;

create table if not exists public.knowledge_base (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  title      text not null default '',
  content    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_base_org_idx
  on public.knowledge_base (org_id, updated_at desc);

-- Keep updated_at fresh on every UPDATE, regardless of who writes.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists knowledge_base_touch_updated_at on public.knowledge_base;
create trigger knowledge_base_touch_updated_at
  before update on public.knowledge_base
  for each row execute function public.touch_updated_at();

-- Row-level security: strict per-org isolation, identical pattern to leads.
alter table public.knowledge_base enable row level security;
drop policy if exists "no_public_access" on public.knowledge_base;
drop policy if exists "org_isolation" on public.knowledge_base;
create policy "org_isolation" on public.knowledge_base
  for all to authenticated
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));
