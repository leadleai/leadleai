-- Keywords per knowledge-base entry, used by the RULE-BASED follow-up matcher
-- (backend/kb_match.py). When a lead's enquiry contains an entry's keywords, that
-- entry's content is dropped into the follow-up email — no AI, no external calls.
--
-- Stored as a text[] so the org can define several triggers per entry, e.g. a
-- pricing entry might carry {price, pricing, cost, "how much"}. Matching is
-- case-insensitive and done in Python; nothing here needs to change per-org.

alter table public.knowledge_base
  add column if not exists keywords text[] not null default '{}';

-- Existing RLS (org_isolation) already covers this new column — a text[] on the
-- same row inherits the row's policy, so no policy change is needed.
