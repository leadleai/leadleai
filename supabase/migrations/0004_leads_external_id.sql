-- CRM import needs a stable external id to dedupe against the source CRM.
alter table public.leads add column if not exists external_id text;
create index if not exists leads_external_id_idx on public.leads (external_id);
