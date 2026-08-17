import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Radar, Loader2, AlertTriangle, Globe, RefreshCw, Plus, Trash2,
  Sparkles, ExternalLink, Clock, Activity, KeyRound, Search,
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
import { competitorsApi } from "@/lib/backend";
import { toast } from "sonner";

// Short "last checked" relative label.
function lastCheckedLabel(iso) {
  if (!iso) return "never checked";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never checked";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "checked just now";
  if (mins < 60) return `checked ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `checked ${hrs}h ago`;
  return `checked ${Math.round(hrs / 24)}d ago`;
}

// Monochrome activity-level treatments, mirroring the Prospects status chips.
const ACTIVITY_META = {
  high: { label: "High activity", cls: "bg-neutral-900 text-white dark:bg-white dark:text-black border-transparent" },
  moderate: { label: "Moderate", cls: "border border-neutral-400 dark:border-white/40 bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white" },
  low: { label: "Low activity", cls: "border border-neutral-300 dark:border-white/25 bg-transparent text-neutral-700 dark:text-neutral-200" },
  none: { label: "Quiet", cls: "border border-neutral-200 dark:border-white/15 bg-transparent text-muted-foreground" },
};

// Normalize a user-entered website into a clickable href.
function hrefFor(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default function MarketWatch() {
  const [competitors, setCompetitors] = useState([]);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);

  const [usage, setUsage] = useState(null);
  const [checkingId, setCheckingId] = useState(null); // competitor id with an analysis in flight
  const [busyId, setBusyId] = useState(null);         // competitor id with a CRUD action in flight

  // Add-competitor dialog.
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", notes: "" });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const data = await competitorsApi.list();
      setCompetitors(Array.isArray(data?.competitors) ? data.competitors : []);
      setAiConfigured(!!data?.ai_configured);
      setState("ready");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }, []);

  const loadUsage = useCallback(async () => {
    try { setUsage(await competitorsApi.usage()); } catch { /* best-effort */ }
  }, []);

  useEffect(() => { load(); loadUsage(); }, [load, loadUsage]);

  const addCompetitor = async () => {
    if (!form.name.trim()) {
      toast.error("Enter the competitor's name.");
      return;
    }
    setAdding(true);
    try {
      const created = await competitorsApi.create({
        name: form.name.trim(),
        website: form.website.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setCompetitors((c) => [{ ...created, latest_insight: null }, ...c]);
      setAddOpen(false);
      setForm({ name: "", website: "", notes: "" });
      toast.success(`${created.name} added`, {
        description: aiConfigured
          ? "Use “Check now” to pull its latest activity."
          : "Add your Anthropic key to start pulling insights.",
      });
      loadUsage();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (c, is_active) => {
    setCompetitors((list) => list.map((x) => (x.id === c.id ? { ...x, is_active } : x)));
    try {
      await competitorsApi.update(c.id, { is_active });
    } catch (e) {
      setCompetitors((list) => list.map((x) => (x.id === c.id ? { ...x, is_active: !is_active } : x)));
      toast.error(e.message);
    }
  };

  const removeCompetitor = async (c) => {
    const prev = competitors;
    setBusyId(c.id);
    setCompetitors((list) => list.filter((x) => x.id !== c.id));
    try {
      await competitorsApi.remove(c.id);
      toast.success(`${c.name} removed`);
      loadUsage();
    } catch (e) {
      setCompetitors(prev);
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const checkNow = async (c) => {
    setCheckingId(c.id);
    try {
      const r = await competitorsApi.check(c.id);
      if (!r.configured) {
        setAiConfigured(false);
        toast.error("AI not configured", { description: r.message });
        return;
      }
      if (r.insight) {
        setCompetitors((list) =>
          list.map((x) => (x.id === c.id
            ? { ...x, latest_insight: r.insight, last_checked_at: r.insight.created_at || new Date().toISOString() }
            : x)));
        toast.success(`Updated intel on ${c.name}`);
        loadUsage();
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCheckingId(null);
    }
  };

  const activeCount = useMemo(() => competitors.filter((c) => c.is_active).length, [competitors]);

  return (
    <div>
      <PageHeader
        title="Market Watch"
        subtitle={
          state === "ready"
            ? `${competitors.length} ${competitors.length === 1 ? "competitor" : "competitors"} tracked · ${activeCount} active`
            : "Track competitors and let AI summarize what's new"
        }
        testid="marketwatch-header"
        action={
          <div className="flex items-center gap-2">
            <Button data-testid="marketwatch-refresh" variant="outline" className="rounded-full" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
            <Button data-testid="marketwatch-add-btn" className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add competitor
            </Button>
          </div>
        }
      />

      {/* Dormant state — AI key not set. Feature still works; insights are just paused. */}
      {!aiConfigured && state === "ready" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.06] px-4 py-3 text-sm" data-testid="marketwatch-dormant">
          <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">AI intelligence isn't enabled yet</p>
            <p className="text-amber-800/80 dark:text-amber-200/70 mt-0.5">
              Add <code className="rounded bg-amber-500/10 px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code> to the backend to
              turn on automatic competitor summaries. You can still add and manage competitors — insights will start
              flowing the moment the key is set.
            </p>
          </div>
        </div>
      )}

      {/* How it works note */}
      {aiConfigured && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] px-4 py-3 text-xs text-muted-foreground">
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            For each competitor, AI searches the web for recent news, offers, pricing and product moves, then
            summarizes them here with source links. Active competitors are re-checked automatically on the schedule set
            in <a href="/app/automation" className="underline underline-offset-2">Automation settings</a> — or press
            <strong> Check now</strong> for a fresh pull. Each check is billed, so it's capped per month.
            {usage && (
              <span className="ml-1">
                {usage.used}/{usage.max_per_month} AI checks used this month.
              </span>
            )}
          </p>
        </div>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading competitors…
        </div>
      )}

      {state === "error" && (
        <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm" data-testid="marketwatch-error">
          <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
            <AlertTriangle className="w-4 h-4" /> Couldn't load competitors
          </div>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
        </div>
      )}

      {state === "ready" && competitors.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 flex flex-col items-center text-center px-6" data-testid="marketwatch-empty">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4"><Radar className="w-6 h-6 text-neutral-500" /></div>
          <h3 className="font-heading font-semibold text-lg">No competitors tracked yet</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm">
            Add a competitor (name + website) and AI will keep an eye on their recent activity for you.
          </p>
          <Button className="mt-5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add your first competitor
          </Button>
        </div>
      )}

      {state === "ready" && competitors.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2" data-testid="marketwatch-grid">
          {competitors.map((c, i) => {
            const ins = c.latest_insight;
            const level = ins?.details?.activity_level;
            const meta = level ? ACTIVITY_META[level] : null;
            const keyPoints = ins?.details?.key_points || [];
            const sources = ins?.source_urls || [];
            const checking = checkingId === c.id;
            return (
              <motion.div key={c.id}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.04, type: "spring", stiffness: 260, damping: 24 }}
                className={`flex flex-col rounded-2xl border bg-white dark:bg-white/[0.02] p-4 ${
                  c.is_active ? "border-neutral-200 dark:border-white/10" : "border-neutral-200/60 dark:border-white/5 opacity-70"
                }`}
                data-testid={`competitor-card-${c.id}`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{c.name}</span>
                      {meta && <Badge className={`rounded-full font-medium ${meta.cls}`}>{meta.label}</Badge>}
                      {!c.is_active && (
                        <span className="rounded-full border border-neutral-300 dark:border-white/20 px-2 py-0.5 text-[11px] text-muted-foreground">Paused</span>
                      )}
                    </div>
                    {c.website && (
                      <a href={hrefFor(c.website)} target="_blank" rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
                        <Globe className="w-3 h-3" /> {c.website.replace(/^https?:\/\//i, "")}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch checked={!!c.is_active} onCheckedChange={(v) => toggleActive(c, v)}
                      data-testid={`competitor-toggle-${c.id}`} title={c.is_active ? "Auto-checks on" : "Auto-checks paused"} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-neutral-400 hover:text-red-600"
                      disabled={busyId === c.id} onClick={() => removeCompetitor(c)} data-testid={`competitor-delete-${c.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Insight body */}
                <div className="mt-3 flex-1">
                  {ins ? (
                    <>
                      <p className="text-sm text-neutral-700 dark:text-neutral-200">{ins.summary}</p>
                      {keyPoints.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {keyPoints.map((p, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {sources.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5" data-testid={`competitor-sources-${c.id}`}>
                          {sources.slice(0, 6).map((s, idx) => (
                            <a key={idx} href={hrefFor(s.url)} target="_blank" rel="noreferrer"
                              title={s.title || s.url}
                              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 dark:border-white/15 px-2 py-0.5 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:border-neutral-400">
                              <ExternalLink className="w-2.5 h-2.5" />
                              {(() => { try { return new URL(hrefFor(s.url)).hostname.replace(/^www\./, ""); } catch { return "source"; } })()}
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 dark:border-white/10 py-6 text-center">
                      <Activity className="w-5 h-5 text-neutral-400" />
                      <p className="mt-2 text-sm text-neutral-500">No insight yet</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {aiConfigured ? "Run a check to pull the latest activity." : "Add your Anthropic key to enable insights."}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-white/10 pt-3">
                  <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                    <Clock className="w-3 h-3" /> {lastCheckedLabel(c.last_checked_at)}
                  </span>
                  <Button data-testid={`competitor-check-${c.id}`} variant="outline" size="sm"
                    className="rounded-full" disabled={checking} onClick={() => checkNow(c)}
                    title={aiConfigured ? "Run AI analysis now" : "AI not configured"}>
                    {checking
                      ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Checking…</>
                      : <><Search className="w-3.5 h-3.5 mr-1" /> Check now</>}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add-competitor dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => !adding && setAddOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a competitor</DialogTitle>
            <DialogDescription>
              AI will watch for their recent news, offers and product moves. You can pause or remove them anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
              <Input data-testid="competitor-name" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Acme Robotics" className="rounded-xl" autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Website <span className="text-neutral-400">(optional)</span></label>
              <Input data-testid="competitor-website" value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="acme.com" className="rounded-xl" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes <span className="text-neutral-400">(optional — helps AI disambiguate)</span></label>
              <Textarea data-testid="competitor-notes" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. B2B warehouse robotics, Boston-based" rows={3} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
            <Button data-testid="competitor-add-submit" disabled={adding || !form.name.trim()}
              onClick={addCompetitor} className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              {adding ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Adding…</> : <><Plus className="w-4 h-4 mr-1" /> Add competitor</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
