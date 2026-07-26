-- (A) Email history: one row per send attempt (auto drip OR manual/compose).
create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references public.leads(id) on delete set null,
  to_email    text not null,
  from_email  text,
  subject     text not null,
  body        text,
  status      text not null check (status in ('sent','failed')),
  error       text,
  step        text,          -- '1' | '2' | '3' | 'manual'
  provider_id text,          -- Resend's returned id
  created_at  timestamptz not null default now()
);

create index if not exists email_log_created_at_idx on public.email_log (created_at desc);
create index if not exists email_log_lead_idx on public.email_log (lead_id);

-- Only the service role (FastAPI) touches this; the browser goes through the API.
alter table public.email_log enable row level security;
drop policy if exists "no_public_access" on public.email_log;
create policy "no_public_access" on public.email_log
  for all to anon, authenticated using (false) with check (false);


-- (Optional) Editable follow-up templates. Falls back to the hardcoded
-- defaults in backend/followup.py when a step has no row here.
create table if not exists public.email_templates (
  step       int primary key check (step between 1 and 3),
  subject    text not null,
  body       text not null,
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
drop policy if exists "no_public_access" on public.email_templates;
create policy "no_public_access" on public.email_templates
  for all to anon, authenticated using (false) with check (false);
