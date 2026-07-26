-- Follow-up email drip state.
--   followup_step         : how many follow-ups have been sent (0..3). Hard cap 3.
--   last_followup_at      : when the most recent follow-up was sent.
--   followup_unsubscribed : set by the unsubscribe link in every email.

alter table public.leads add column if not exists followup_step int not null default 0;
alter table public.leads add column if not exists last_followup_at timestamptz;
alter table public.leads add column if not exists followup_unsubscribed boolean not null default false;

-- The sweep looks for leads that still have steps left and haven't opted out.
create index if not exists leads_followup_idx
  on public.leads (followup_step, followup_unsubscribed);
