-- Call history: one row per Bland dial attempt (manual, auto, or CRM import).
-- Mirrors email_log (0006) — failures are logged too, so an international rate
-- limit or a bad number is visible in the dashboard instead of only in the logs.
create table if not exists public.call_log (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid references public.leads(id) on delete set null,
  to_phone   text not null,
  call_id    text,          -- Bland's returned id; null when the attempt failed
  status     text not null check (status in ('placed','failed')),
  trigger    text not null check (trigger in ('manual','auto','import')),
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists call_log_created_at_idx on public.call_log (created_at desc);
create index if not exists call_log_lead_idx on public.call_log (lead_id);

-- Only the service role (FastAPI) touches this; the browser goes through the API.
alter table public.call_log enable row level security;
drop policy if exists "no_public_access" on public.call_log;
create policy "no_public_access" on public.call_log
  for all to anon, authenticated using (false) with check (false);
