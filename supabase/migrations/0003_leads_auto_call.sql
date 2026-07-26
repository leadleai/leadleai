-- Auto-calling support for the leads table.
--   auto_called_at : when the AI auto-called this lead (null = not yet). Used as
--                    the "call once only" guard and for the dashboard badge.
--   call_id        : the Bland.ai call id from the (auto or manual) call.

alter table public.leads add column if not exists auto_called_at timestamptz;
alter table public.leads add column if not exists call_id text;

-- Speeds up the dedupe lookup (same phone auto-called recently).
create index if not exists leads_phone_auto_called_idx
  on public.leads (phone, auto_called_at);
