import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Mail, Phone as PhoneIcon, RefreshCw, Inbox, Loader2, AlertTriangle, Zap, Download, ChevronRight, X, Upload } from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import CallButton from "@/components/app/CallButton";
import FollowupButton from "@/components/app/FollowupButton";
import ImportLeadsDialog from "@/components/app/ImportLeadsDialog";
import { TagChip } from "@/components/app/LeadTags";
import { leadsApi, crmApi, tagsApi, LEAD_STATUSES, MAX_FOLLOWUPS } from "@/lib/backend";
import { toast } from "sonner";

// Human labels for the `source` a lead came in through.
const SOURCE_META = {
  inbound: "Inbound form",
  import: "File import",
  crm: "CRM",
};

// Monochrome status treatments — meaning is carried by the label + fill/outline
// weight (solid = fresh/actionable, outline = in-progress, muted = done), no hue.
const STATUS_META = {
  new: { label: "New", cls: "bg-neutral-900 text-white dark:bg-white dark:text-black border-transparent" },
  contacted: { label: "Contacted", cls: "border border-neutral-300 dark:border-white/25 bg-transparent text-neutral-700 dark:text-neutral-200" },
  interested: { label: "Interested", cls: "border border-neutral-400 dark:border-white/40 bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white" },
  meeting_booked: { label: "Meeting booked", cls: "border border-neutral-900 dark:border-white bg-transparent text-neutral-900 dark:text-white font-semibold" },
  closed: { label: "Closed", cls: "border border-neutral-200 dark:border-white/15 bg-transparent text-muted-foreground" },
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [crm, setCrm] = useState(null); // { provider, ready }
  const [importing, setImporting] = useState(false);
  const [orgTags, setOrgTags] = useState([]);
  const [tagFilter, setTagFilter] = useState(null); // tag id, or null for "all"
  const [sourceFilter, setSourceFilter] = useState(null); // source string, or null for "all"
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const data = await leadsApi.list();
      setLeads(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { crmApi.status().then(setCrm).catch(() => setCrm(null)); }, []);
  useEffect(() => { tagsApi.list().then((t) => setOrgTags(Array.isArray(t) ? t : [])).catch(() => setOrgTags([])); }, []);

  const importFromCrm = async () => {
    setImporting(true);
    try {
      const r = await crmApi.import();
      const parts = [`Imported ${r.imported}`];
      if (r.updated) parts.push(`updated ${r.updated}`);
      if (r.skipped) parts.push(`skipped ${r.skipped}`);
      const queued = r.auto_calls?.queued || 0;
      toast.success(`${parts.join(" · ")} from ${r.provider} CRM`, {
        description: queued ? `${queued} auto-call${queued > 1 ? "s" : ""} queued` : "No auto-calls queued",
      });
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const changeStatus = async (lead, status) => {
    const prev = lead.status;
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, status } : l))); // optimistic
    try {
      await leadsApi.updateStatus(lead.id, status);
      toast.success(`${lead.name} → ${STATUS_META[status]?.label || status}`);
    } catch (e) {
      setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, status: prev } : l)));
      toast.error(e.message);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      const matchesQuery = !q ||
        l.name?.toLowerCase().includes(q) || l.enquiry?.toLowerCase().includes(q);
      const matchesTag = !tagFilter || (l.tags || []).some((t) => t.id === tagFilter);
      const matchesSource = !sourceFilter || (l.source || "inbound") === sourceFilter;
      return matchesQuery && matchesTag && matchesSource;
    });
  }, [leads, query, tagFilter, sourceFilter]);

  // Sources present across the loaded leads (for the filter chips).
  const usedSources = useMemo(
    () => Array.from(new Set(leads.map((l) => l.source || "inbound"))).sort(),
    [leads],
  );

  // Only offer tag filters that at least one loaded lead actually carries.
  const usedTagIds = useMemo(
    () => new Set(leads.flatMap((l) => (l.tags || []).map((t) => t.id))),
    [leads],
  );
  const filterTags = useMemo(
    () => orgTags.filter((t) => usedTagIds.has(t.id)),
    [orgTags, usedTagIds],
  );

  return (
    <div>
      <PageHeader
        title="Inbound Leads"
        subtitle={state === "ready" ? `${filtered.length} of ${leads.length} leads${query ? ` matching “${query}”` : ""}` : "Enquiries from your public form"}
        testid="leads-header"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {crm && (
              <Badge data-testid="crm-provider-badge"
                className={`rounded-full ${crm.ready ? "border-0 bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300" : "border border-neutral-400 dark:border-white/40 bg-transparent text-neutral-700 dark:text-neutral-200"}`}>
                CRM: {crm.provider}{crm.ready ? "" : " · not ready"}
              </Badge>
            )}
            <Button data-testid="import-file-btn" variant="outline" onClick={() => setImportOpen(true)}
              className="rounded-full">
              <Upload className="w-4 h-4 mr-1" /> Import from file
            </Button>
            <Button data-testid="crm-import-btn" onClick={importFromCrm} disabled={importing}
              className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              {importing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing…</> : <><Download className="w-4 h-4 mr-1" /> Import from CRM</>}
            </Button>
            <Button data-testid="leads-refresh" variant="outline" className="rounded-full" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
        }
      />

      {state !== "error" && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input data-testid="leads-search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or enquiry…" className="pl-9 rounded-xl" />
        </div>
      )}

      {state === "ready" && usedSources.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="leads-source-filter">
          <span className="text-xs text-muted-foreground mr-1">Source:</span>
          <button
            onClick={() => setSourceFilter(null)}
            data-testid="leads-source-filter-all"
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              sourceFilter === null
                ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                : "border border-neutral-200 dark:border-white/15 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
            }`}
          >
            All
          </button>
          {usedSources.map((s) => {
            const active = sourceFilter === s;
            return (
              <button
                key={s}
                onClick={() => setSourceFilter(active ? null : s)}
                data-testid={`leads-source-filter-${s}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "border border-neutral-200 dark:border-white/15 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
                }`}
              >
                {SOURCE_META[s] || s}
                {active && <X className="w-3 h-3" />}
              </button>
            );
          })}
        </div>
      )}

      {state === "ready" && filterTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="leads-tag-filter">
          <button
            onClick={() => setTagFilter(null)}
            data-testid="leads-tag-filter-all"
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              tagFilter === null
                ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                : "border border-neutral-200 dark:border-white/15 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
            }`}
          >
            All
          </button>
          {filterTags.map((t) => {
            const active = tagFilter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTagFilter(active ? null : t.id)}
                data-testid={`leads-tag-filter-${t.id}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "border border-neutral-200 dark:border-white/15 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                {t.name}
                {active && <X className="w-3 h-3" />}
              </button>
            );
          })}
        </div>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading leads…
        </div>
      )}

      {state === "error" && (
        <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm" data-testid="leads-error">
          <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
            <AlertTriangle className="w-4 h-4" /> Couldn’t load leads
          </div>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
        </div>
      )}

      {state === "ready" && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 flex flex-col items-center text-center px-6" data-testid="leads-empty">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4"><Inbox className="w-6 h-6 text-neutral-500" /></div>
          <h3 className="font-heading font-semibold text-lg">{query ? "No matching leads" : "No inbound leads yet"}</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm">
            {query ? `Nothing matches “${query}”.` : "Share your enquiry form link (e.g. from your Google Business Profile) and submissions will appear here."}
          </p>
        </div>
      )}

      {state === "ready" && filtered.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden divide-y divide-neutral-100 dark:divide-white/10">
          {filtered.map((lead, i) => {
            const meta = STATUS_META[lead.status] || STATUS_META.new;
            return (
              <motion.div key={lead.id}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.05, type: "spring", stiffness: 260, damping: 24 }}
                whileHover={{ x: 5 }}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors" data-testid={`lead-row-${lead.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/app/leads/${lead.id}`}
                      data-testid={`lead-open-${lead.id}`}
                      className="font-medium hover:underline underline-offset-4 decoration-neutral-400"
                    >
                      {lead.name}
                    </Link>
                    {lead.company && <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs text-neutral-600 dark:text-neutral-300">{lead.company}</span>}
                    <Badge className={`rounded-full font-medium ${meta.cls}`}>{meta.label}</Badge>
                    <span data-testid={`lead-source-${lead.id}`}
                      className="inline-flex items-center rounded-full border border-neutral-200 dark:border-white/15 bg-transparent px-2 py-0.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {SOURCE_META[lead.source] || lead.source || "Inbound form"}
                    </span>
                    {lead.auto_called_at && (
                      <span data-testid={`lead-autocalled-${lead.id}`}
                        title={lead.call_id ? `Bland call ${lead.call_id}` : undefined}
                        className="inline-flex items-center gap-1 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black px-2 py-0.5 text-xs font-medium">
                        <Zap className="w-3 h-3" /> Auto-called · {new Date(lead.auto_called_at).toLocaleString()}
                      </span>
                    )}
                    <span data-testid={`lead-followup-${lead.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 px-2 py-0.5 text-xs font-medium">
                      <Mail className="w-3 h-3" /> Follow-up {lead.followup_step ?? 0}/{MAX_FOLLOWUPS}
                      {lead.last_followup_at ? ` · ${new Date(lead.last_followup_at).toLocaleString()}` : ""}
                    </span>
                    {lead.followup_unsubscribed && (
                      <span data-testid={`lead-unsubscribed-${lead.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-neutral-400 dark:border-white/40 bg-transparent text-neutral-500 dark:text-neutral-400 line-through px-2 py-0.5 text-xs font-medium">
                        Unsubscribed
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-neutral-500">
                    <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-neutral-800 dark:hover:text-neutral-200"><PhoneIcon className="w-3 h-3" />{lead.phone}</a>
                    <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-neutral-800 dark:hover:text-neutral-200"><Mail className="w-3 h-3" />{lead.email}</a>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{lead.enquiry}</p>
                  {lead.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`lead-tags-${lead.id}`}>
                      {lead.tags.map((t) => <TagChip key={t.id} tag={t} small />)}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <Link
                    to={`/app/leads/${lead.id}`}
                    data-testid={`lead-view-${lead.id}`}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                    View timeline <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                  <CallButton lead={lead} />
                  <FollowupButton lead={lead} onSent={load} />
                  <select
                    data-testid={`lead-status-${lead.id}`}
                    value={lead.status}
                    onChange={(e) => changeStatus(lead, e.target.value)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-white/[0.02] px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 outline-none"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>
                    ))}
                  </select>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
    </div>
  );
}
