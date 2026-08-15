import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search, Loader2, AlertTriangle, Mail, Phone as PhoneIcon, Globe, MapPin, Star,
  RefreshCw, Microscope, X, UserPlus, CheckCircle2, ShieldCheck, Send,
  Bookmark, Trash2, Repeat, Clock,
} from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { prospectsApi, savedSearchesApi, PROSPECT_STATUSES } from "@/lib/backend";
import { toast } from "sonner";

// Short "last run" relative label for a saved search.
function lastRunLabel(iso) {
  if (!iso) return "never run yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never run yet";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "ran just now";
  if (mins < 60) return `ran ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `ran ${hrs}h ago`;
  return `ran ${Math.round(hrs / 24)}d ago`;
}

// Monochrome status treatments, mirroring the Leads page.
const STATUS_META = {
  new: { label: "New", cls: "bg-neutral-900 text-white dark:bg-white dark:text-black border-transparent" },
  contacted: { label: "Contacted", cls: "border border-neutral-300 dark:border-white/25 bg-transparent text-neutral-700 dark:text-neutral-200" },
  interested: { label: "Interested", cls: "border border-neutral-400 dark:border-white/40 bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white" },
  not_interested: { label: "Not interested", cls: "border border-neutral-200 dark:border-white/15 bg-transparent text-muted-foreground" },
  converted: { label: "Converted", cls: "border border-neutral-900 dark:border-white bg-transparent text-neutral-900 dark:text-white font-semibold" },
};

// Prefill an editable, compliant cold-email draft for one prospect.
function draftFor(p) {
  const name = p.name || "your business";
  return {
    subject: `Quick question about ${name}`,
    body:
      `Hi there,\n\n` +
      `I came across ${name}${p.category ? ` while looking at ${p.category.toLowerCase()}s` : ""} and wanted to reach out.\n\n` +
      `We help businesses like yours respond to new enquiries faster and book more meetings. Would you be open to a short chat?\n\n` +
      `Best regards`,
  };
}

// Turn a plain-text textarea body into a simple HTML fragment (blank lines ->
// paragraphs, single newlines -> <br>). The backend wraps this and appends the
// required unsubscribe footer.
function bodyToHtml(text) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (text || "")
    .split(/\n\s*\n/)
    .map((para) => `<p>${esc(para.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export default function Prospects() {
  const [prospects, setProspects] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);

  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [searching, setSearching] = useState(false);
  const [usage, setUsage] = useState(null); // { remaining, limit } after a search

  const [statusFilter, setStatusFilter] = useState(null);
  const [busyId, setBusyId] = useState(null); // prospect id with an action in flight

  const [emailFor, setEmailFor] = useState(null); // prospect object for the compose dialog
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const [sending, setSending] = useState(false);

  // Saved searches (the queries re-run on a schedule by the automated sweep).
  const [saved, setSaved] = useState([]);
  const [savingSearch, setSavingSearch] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const data = await prospectsApi.list();
      setProspects(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const data = await savedSearchesApi.list();
      setSaved(Array.isArray(data) ? data : []);
    } catch { /* best-effort — the saved-search panel just stays empty */ }
  }, []);

  useEffect(() => { load(); loadSaved(); }, [load, loadSaved]);

  // Save the current category+location as a scheduled search.
  const saveCurrentSearch = async () => {
    if (!category.trim() || !location.trim()) {
      toast.error("Enter both a category and a location to save.");
      return;
    }
    setSavingSearch(true);
    try {
      const created = await savedSearchesApi.create({ category: category.trim(), location: location.trim() });
      setSaved((s) => [created, ...s]);
      toast.success("Search saved", {
        description: "It'll re-run on the schedule set in Automation settings.",
      });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingSearch(false);
    }
  };

  const toggleSaved = async (s, is_active) => {
    setSaved((list) => list.map((x) => (x.id === s.id ? { ...x, is_active } : x)));
    try {
      await savedSearchesApi.update(s.id, { is_active });
    } catch (e) {
      setSaved((list) => list.map((x) => (x.id === s.id ? { ...x, is_active: !is_active } : x)));
      toast.error(e.message);
    }
  };

  const removeSaved = async (s) => {
    const prev = saved;
    setSaved((list) => list.filter((x) => x.id !== s.id));
    try {
      await savedSearchesApi.remove(s.id);
      toast.success("Saved search removed");
    } catch (e) {
      setSaved(prev);
      toast.error(e.message);
    }
  };

  // Load a saved search back into the manual search form (and run it).
  const runSaved = (s) => {
    setCategory(s.category || "");
    setLocation(s.location || "");
    toast.info(`Loaded “${s.query}” — press Search to run it now.`);
  };

  const runSearch = async (e) => {
    e?.preventDefault();
    if (!category.trim() || !location.trim()) {
      toast.error("Enter both a category and a location.");
      return;
    }
    setSearching(true);
    try {
      const r = await prospectsApi.search({ category: category.trim(), location: location.trim() });
      setUsage({ remaining: r.api_requests_remaining, limit: r.api_requests_limit });
      const parts = [`Found ${r.found}`];
      if (r.stored) parts.push(`${r.stored} new`);
      if (r.updated) parts.push(`${r.updated} updated`);
      toast.success(parts.join(" · "), {
        description: r.api_requests_remaining != null
          ? `${r.api_requests_remaining} API searches left this month`
          : "One API search used",
      });
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  };

  const changeStatus = async (p, status) => {
    const prev = p.status;
    setProspects((ps) => ps.map((x) => (x.id === p.id ? { ...x, status } : x)));
    try {
      await prospectsApi.update(p.id, { status });
    } catch (e) {
      setProspects((ps) => ps.map((x) => (x.id === p.id ? { ...x, status: prev } : x)));
      toast.error(e.message);
    }
  };

  const saveNotes = async (p, notes) => {
    if ((p.notes || "") === (notes || "")) return;
    try {
      await prospectsApi.update(p.id, { notes });
      setProspects((ps) => ps.map((x) => (x.id === p.id ? { ...x, notes } : x)));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const markContacted = async (p) => {
    setBusyId(p.id);
    try {
      await prospectsApi.update(p.id, { status: "contacted" });
      setProspects((ps) => ps.map((x) => (x.id === p.id ? { ...x, status: "contacted" } : x)));
      toast.success(`${p.name} marked as contacted`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const convert = async (p) => {
    setBusyId(p.id);
    try {
      const r = await prospectsApi.convert(p.id);
      setProspects((ps) => ps.map((x) => (x.id === p.id ? { ...x, status: "converted", converted_lead_id: r.lead_id } : x)));
      toast.success(r.already ? `${p.name} was already a lead` : `${p.name} converted to a lead`, {
        description: "It now flows through the normal pipeline.",
      });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const openEmail = (p) => {
    setEmailFor(p);
    setDraft(draftFor(p));
  };

  const sendEmail = async () => {
    if (!emailFor) return;
    setSending(true);
    try {
      await prospectsApi.sendEmail(emailFor.id, {
        to: emailFor.email,
        subject: draft.subject,
        body: bodyToHtml(draft.body),
      });
      setProspects((ps) => ps.map((x) => (x.id === emailFor.id && x.status === "new" ? { ...x, status: "contacted" } : x)));
      toast.success(`Cold email sent to ${emailFor.name}`, { description: "Unsubscribe link included." });
      setEmailFor(null);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const filtered = useMemo(
    () => (statusFilter ? prospects.filter((p) => p.status === statusFilter) : prospects),
    [prospects, statusFilter],
  );

  const usedStatuses = useMemo(
    () => Array.from(new Set(prospects.map((p) => p.status))).sort(),
    [prospects],
  );

  return (
    <div>
      <PageHeader
        title="Prospects"
        subtitle={
          state === "ready"
            ? `${filtered.length} of ${prospects.length} discovered ${prospects.length === 1 ? "business" : "businesses"}`
            : "Discover businesses to review and reach out to — compliantly"
        }
        testid="prospects-header"
        action={
          <Button data-testid="prospects-refresh" variant="outline" className="rounded-full" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        }
      />

      {/* Compliance note */}
      <div className="mb-5 flex items-start gap-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] px-4 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Discovery for review and <strong>compliant</strong> outreach. Prospects are never auto-called —
          reach out by cold email (unsubscribe link always included) or mark them contacted after you reach
          out yourself. Convert a prospect to a lead to bring it into the normal pipeline.
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={runSearch} className="mb-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
            <Input data-testid="prospect-category" value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. salons" className="rounded-xl" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
            <Input data-testid="prospect-location" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Mumbai" className="rounded-xl" />
          </div>
          <div className="flex gap-2">
            <Button data-testid="prospect-search-btn" type="submit" disabled={searching}
              className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              {searching ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Searching…</> : <><Search className="w-4 h-4 mr-1" /> Search</>}
            </Button>
            <Button data-testid="prospect-save-search-btn" type="button" variant="outline"
              disabled={savingSearch} onClick={saveCurrentSearch} className="rounded-full"
              title="Save this category + location to re-run automatically">
              {savingSearch ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Bookmark className="w-4 h-4 mr-1" />} Save
            </Button>
          </div>
        </div>
        {usage && (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="prospect-usage">
            {usage.remaining != null
              ? `${usage.remaining}${usage.limit ? ` / ${usage.limit}` : ""} API searches left this month`
              : "One API search used"}
          </p>
        )}
      </form>

      {/* Saved / scheduled searches */}
      {saved.length > 0 && (
        <div className="mb-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4" data-testid="saved-searches">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-neutral-500" />
              <span className="text-sm font-medium">Saved searches</span>
              <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {saved.filter((s) => s.is_active).length} active
              </Badge>
            </div>
            <a href="/app/settings" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-200">
              Set the schedule in Automation →
            </a>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-white/10">
            {saved.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5" data-testid={`saved-search-${s.id}`}>
                <div className="min-w-0 flex-1">
                  <button onClick={() => runSaved(s)} className="truncate text-left text-sm font-medium hover:underline underline-offset-2">
                    {s.query}
                  </button>
                  <p className="flex items-center gap-1 text-xs text-neutral-400">
                    <Clock className="w-3 h-3" /> {lastRunLabel(s.last_run_at)}
                    {!s.is_active && <span className="ml-1">· paused</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={!!s.is_active} onCheckedChange={(v) => toggleSaved(s, v)}
                    data-testid={`saved-search-toggle-${s.id}`} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-neutral-400 hover:text-red-600"
                    onClick={() => removeSaved(s)} data-testid={`saved-search-delete-${s.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Active searches re-run automatically and only <strong>discover</strong> new businesses into this list — nothing is auto-emailed or auto-called.
          </p>
        </div>
      )}

      {/* Status filter chips */}
      {state === "ready" && usedStatuses.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="prospects-status-filter">
          <button onClick={() => setStatusFilter(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === null
                ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                : "border border-neutral-200 dark:border-white/15 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
            }`}>All</button>
          {usedStatuses.map((s) => {
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => setStatusFilter(active ? null : s)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "border border-neutral-200 dark:border-white/15 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
                }`}>
                {STATUS_META[s]?.label || s}
                {active && <X className="w-3 h-3" />}
              </button>
            );
          })}
        </div>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading prospects…
        </div>
      )}

      {state === "error" && (
        <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm" data-testid="prospects-error">
          <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
            <AlertTriangle className="w-4 h-4" /> Couldn’t load prospects
          </div>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
        </div>
      )}

      {state === "ready" && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 flex flex-col items-center text-center px-6" data-testid="prospects-empty">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4"><Microscope className="w-6 h-6 text-neutral-500" /></div>
          <h3 className="font-heading font-semibold text-lg">No prospects yet</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm">
            Search a category and location above (e.g. “salons” in “Mumbai”) to discover businesses to review.
          </p>
        </div>
      )}

      {state === "ready" && filtered.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden divide-y divide-neutral-100 dark:divide-white/10">
          {filtered.map((p, i) => {
            const meta = STATUS_META[p.status] || STATUS_META.new;
            const converted = p.status === "converted";
            return (
              <motion.div key={p.id}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.04, type: "spring", stiffness: 260, damping: 24 }}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                data-testid={`prospect-row-${p.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.category && <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs text-neutral-600 dark:text-neutral-300">{p.category}</span>}
                    <Badge className={`rounded-full font-medium ${meta.cls}`}>{meta.label}</Badge>
                    {p.rating != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 px-2 py-0.5 text-xs font-medium">
                        <Star className="w-3 h-3" /> {p.rating}{p.review_count ? ` · ${p.review_count}` : ""}
                      </span>
                    )}
                    {p.unsubscribed && (
                      <span className="inline-flex items-center rounded-full border border-neutral-400 dark:border-white/40 bg-transparent text-neutral-500 dark:text-neutral-400 line-through px-2 py-0.5 text-xs font-medium">
                        Unsubscribed
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-neutral-500">
                    {p.phone && <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 hover:text-neutral-800 dark:hover:text-neutral-200"><PhoneIcon className="w-3 h-3" />{p.phone}</a>}
                    {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:text-neutral-800 dark:hover:text-neutral-200"><Mail className="w-3 h-3" />{p.email}</a>}
                    {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-neutral-800 dark:hover:text-neutral-200"><Globe className="w-3 h-3" />Website</a>}
                  </div>
                  {p.address && (
                    <p className="mt-1 inline-flex items-start gap-1 text-xs text-neutral-500 dark:text-neutral-400"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{p.address}</p>
                  )}
                  <Textarea
                    data-testid={`prospect-notes-${p.id}`}
                    defaultValue={p.notes || ""}
                    onBlur={(e) => saveNotes(p, e.target.value)}
                    placeholder="Add a note…"
                    rows={1}
                    className="mt-2 min-h-[36px] resize-y rounded-lg text-sm"
                  />
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end sm:w-52">
                  <select
                    data-testid={`prospect-status-${p.id}`}
                    value={p.status}
                    disabled={converted}
                    onChange={(e) => changeStatus(p, e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-white/[0.02] px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 outline-none disabled:opacity-60"
                  >
                    {PROSPECT_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>
                    ))}
                  </select>

                  {p.email ? (
                    <Button data-testid={`prospect-email-${p.id}`} variant="outline" size="sm"
                      disabled={p.unsubscribed} onClick={() => openEmail(p)}
                      className="w-full rounded-full">
                      <Mail className="w-3.5 h-3.5 mr-1" /> {p.unsubscribed ? "Unsubscribed" : "Cold email"}
                    </Button>
                  ) : (
                    <span className="w-full text-center text-[11px] text-muted-foreground">No email found</span>
                  )}

                  <Button data-testid={`prospect-contacted-${p.id}`} variant="outline" size="sm"
                    disabled={busyId === p.id || converted || p.status === "contacted"}
                    onClick={() => markContacted(p)} className="w-full rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark contacted
                  </Button>

                  {converted ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Converted to lead
                    </span>
                  ) : (
                    <Button data-testid={`prospect-convert-${p.id}`} size="sm"
                      disabled={busyId === p.id} onClick={() => convert(p)}
                      className="w-full rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                      {busyId === p.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <UserPlus className="w-3.5 h-3.5 mr-1" />}
                      Convert to lead
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Cold-email compose dialog */}
      <Dialog open={!!emailFor} onOpenChange={(o) => !o && setEmailFor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cold email {emailFor?.name}</DialogTitle>
            <DialogDescription>
              Sent to {emailFor?.email}. An unsubscribe link is appended automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Subject</label>
              <Input data-testid="prospect-email-subject" value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Message</label>
              <Textarea data-testid="prospect-email-body" value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} rows={9} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setEmailFor(null)}>Cancel</Button>
            <Button data-testid="prospect-email-send" disabled={sending || !draft.subject.trim() || !draft.body.trim()}
              onClick={sendEmail} className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              {sending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending…</> : <><Send className="w-4 h-4 mr-1" /> Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
