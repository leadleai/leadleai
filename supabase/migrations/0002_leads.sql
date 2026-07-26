-- Inbound leads captured from the public enquiry form.
-- The FastAPI backend reads/writes this table with the SERVICE ROLE key, which
-- bypasses RLS. RLS is enabled with NO public policies, so the anon/authenticated
-- keys (and therefore the browser) cannot touch this table directly.

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  email      text not null,
  company    text,
  enquiry    text not null,
  status     text not null default 'new'
             check (status in ('new','contacted','interested','meeting_booked','closed')),
  source     text not null default 'inbound',
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx on public.leads (status);

-- Lock the table down: RLS on, and intentionally no anon/authenticated policies.
-- Only the service role (used by FastAPI) can access it.
alter table public.leads enable row level security;

-- (Optional) make the intent explicit — deny everything to public roles:
drop policy if exists "no_public_access" on public.leads;
create policy "no_public_access"
  on public.leads
  for all
  to anon, authenticated
  using (false)
  with check (false);
