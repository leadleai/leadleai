-- Partial index for the auto-call sweep's candidate query.
--
-- The background auto-call sweep (backend/auto_call.py -> run_auto_call_sweep,
-- via supabase_client.list_leads_for_sweep(only_new_uncalled=True)) fetches only
-- leads that are still callable:
--
--   select * from public.leads
--   where status = 'new' and auto_called_at is null
--   order by created_at desc;
--
-- This runs in SERVICE mode across all orgs, once per sweep tick (~60s). Scoping
-- the fetch server-side keeps the backend's per-sweep working set proportional to
-- work-to-do rather than to total table size (the memory fix). This index does
-- the same on the database side.
--
-- A PARTIAL index is the right tool: its predicate matches the candidate set
-- exactly, so it holds only 'new', un-called leads. Rows drop out of the index
-- the moment they're called (auto_called_at set) or advance past 'new', so it
-- stays tiny on a mature table where most leads are no longer candidates. The
-- (created_at desc) key also satisfies the query's ORDER BY, so the planner can
-- walk the index in order instead of sorting.
--
-- Note: leads.status is NOT NULL DEFAULT 'new' (migration 0002), so `status =
-- 'new'` is exhaustive and the query uses a plain equality (no OR ... IS NULL),
-- which is what lets this partial index apply.
--
-- Safe/idempotent: `if not exists`, and it only adds an index (no data change).

create index if not exists leads_auto_call_candidates_idx
  on public.leads (created_at desc)
  where status = 'new' and auto_called_at is null;
