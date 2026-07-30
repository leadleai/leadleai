import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, PhoneCall, Mic, PhoneOff, Play, Search, RefreshCw, Loader2,
  AlertTriangle, Check, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CountUp } from "@/components/app/motion";
import { callsApi } from "@/lib/backend";
import { calls, transcript } from "@/lib/mockData";
import { toast } from "sonner";

export default function Calls() {
  return (
    <div>
      <PageHeader title="Calls" subtitle="Outbound call history and live agent" testid="calls-header" />
      <Tabs defaultValue="log" className="space-y-6">
        <TabsList className="rounded-full">
          <TabsTrigger value="log" data-testid="calls-tab-log" className="rounded-full">Log</TabsTrigger>
          <TabsTrigger value="live" data-testid="calls-tab-live" className="rounded-full">Live agent</TabsTrigger>
        </TabsList>
        <TabsContent value="log"><CallLog /></TabsContent>
        <TabsContent value="live"><LiveAgent /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── (A) Call log ─────────────────────────────────────────────────────────────
function CallLog() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all"); // all | placed | failed
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      const data = await callsApi.list();
      setRows(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (e) {
      setError(e.message); setState("error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => ({
    total: rows.length,
    placed: rows.filter((r) => r.status === "placed").length,
    failed: rows.filter((r) => r.status === "failed").length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchQ = !q
        || r.to_phone?.toLowerCase().includes(q)
        || r.lead_name?.toLowerCase().includes(q)
        || r.status?.toLowerCase().includes(q);
      const matchS = status === "all" || r.status === status;
      return matchQ && matchS;
    });
  }, [rows, query, status]);

  return (
    <div className="space-y-4">
      {state === "ready" && (
        <div className="grid grid-cols-3 gap-3" data-testid="calls-summary">
          <SummaryTile label="Total calls" value={summary.total} testid="calls-summary-total" />
          <SummaryTile label="Placed" value={summary.placed} testid="calls-summary-placed" />
          <SummaryTile label="Failed" value={summary.failed} testid="calls-summary-failed"
            className="text-muted-foreground" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input data-testid="calls-search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by phone, lead or status…" className="pl-9 rounded-xl" />
        </div>
        <div className="flex gap-2">
          {["all", "placed", "failed"].map((s) => (
            <Button key={s} size="sm" data-testid={`calls-filter-${s}`}
              variant={status === s ? "default" : "outline"}
              onClick={() => setStatus(s)}
              className={`rounded-full capitalize ${status === s ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}>
              {s}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="rounded-full" onClick={load} data-testid="calls-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {state === "ready" && (
        <p className="text-sm text-neutral-500">
          {filtered.length} of {rows.length} call{rows.length === 1 ? "" : "s"}
        </p>
      )}

      {state === "loading" && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-16 flex items-center justify-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading call history…
        </div>
      )}

      {state === "error" && (
        <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm" data-testid="calls-error">
          <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
            <AlertTriangle className="w-4 h-4" /> Couldn’t load call history
          </div>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
        </div>
      )}

      {state === "ready" && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/10 bg-white dark:bg-white/[0.02] py-16 flex flex-col items-center text-center px-6" data-testid="calls-empty">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
            <Phone className="w-6 h-6 text-neutral-500" />
          </div>
          <h3 className="font-heading font-semibold text-lg">{rows.length ? "No matching calls" : "No calls placed yet"}</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm">
            {rows.length ? "Try a different search or filter." : "Calls placed automatically or from a lead will appear here — including ones that fail."}
          </p>
        </div>
      )}

      {state === "ready" && filtered.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden divide-y divide-neutral-100 dark:divide-white/10">
          {filtered.map((r, i) => {
            const open = expanded === r.id;
            return (
              <motion.div key={r.id} data-testid={`call-row-${r.id}`}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.035, type: "spring", stiffness: 280, damping: 26 }}>
                <button onClick={() => setExpanded(open ? null : r.id)}
                  className="w-full text-left p-4 flex items-start gap-3 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors">
                  <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} className="mt-1 shrink-0">
                    <ChevronRight className="w-4 h-4 text-neutral-400" />
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{r.to_phone}</span>
                      <StatusBadge status={r.status} />
                      <TriggerBadge trigger={r.trigger} />
                    </div>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 mt-0.5 truncate">
                      {r.lead_name || <span className="text-neutral-400">Unknown lead</span>}
                      {r.lead_company ? ` · ${r.lead_company}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-400 shrink-0">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                      <div className="px-4 pb-4 pl-11 space-y-3" data-testid={`call-expanded-${r.id}`}>
                        {r.error && (
                          <div className="rounded-xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-3 text-xs text-neutral-700 dark:text-neutral-300">
                            <span className="font-semibold">Error:</span> {r.error}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
                          <span>Call id: {r.call_id || "—"}</span>
                          <span>Trigger: {r.trigger}</span>
                          {r.lead_id && <span>Lead id: {r.lead_id}</span>}
                          {r.created_at && <span>{new Date(r.created_at).toLocaleString()}</span>}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, className = "", testid }) {
  return (
    <motion.div data-testid={testid}
      initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }} whileHover={{ y: -4 }}
      className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4 transition-colors hover:border-neutral-900 dark:hover:border-white/30">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className={`font-display font-semibold text-2xl mt-1 ${className}`}><CountUp value={String(value)} /></p>
    </motion.div>
  );
}

function StatusBadge({ status }) {
  const placed = status === "placed";
  return (
    <Badge className={`rounded-full font-medium ${placed
      ? "border-0 bg-neutral-900 text-white dark:bg-white dark:text-black"
      : "border border-neutral-400 dark:border-white/40 bg-transparent text-neutral-600 dark:text-neutral-300"}`}>
      {placed ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
      {status}
    </Badge>
  );
}

function TriggerBadge({ trigger }) {
  return (
    <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 capitalize">
      {trigger}
    </Badge>
  );
}

// ── (B) Live agent (demo) ────────────────────────────────────────────────────
const sentimentColor = { Positive: "bg-neutral-100 text-neutral-700 dark:bg-neutral-500/15 dark:text-neutral-300", Neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300", Negative: "bg-neutral-100 text-neutral-700 dark:bg-neutral-500/15 dark:text-neutral-300" };

function Waveform({ active }) {
  return (
    <div className="flex items-center justify-center gap-1 h-16">
      {[...Array(28)].map((_, i) => (
        <motion.div key={i} className="w-1 rounded-full bg-white/80"
          animate={active ? { height: [8, 12 + (i % 5) * 8, 8] } : { height: 6 }}
          transition={{ duration: 0.6 + (i % 4) * 0.15, repeat: Infinity, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

function LiveAgent() {
  const [live, setLive] = useState(true);
  const [visible, setVisible] = useState(2);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setVisible((v) => Math.min(v + 1, transcript.length)), 2200);
    return () => clearInterval(t);
  }, [live]);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Select defaultValue="Ava"><SelectTrigger data-testid="voice-selector" className="w-40 rounded-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Ava">Voice: Ava</SelectItem><SelectItem value="Leo">Voice: Leo</SelectItem><SelectItem value="Mia">Voice: Mia</SelectItem></SelectContent></Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white relative overflow-hidden" data-testid="live-call-panel">
            <div className="absolute inset-0 grain opacity-20" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center"><PhoneCall className="w-5 h-5" /></div>
                  <div><p className="font-heading font-semibold">James Wilson · Contoso Cloud</p><p className="text-white/70 text-sm flex items-center gap-1.5">{live && <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" />}{live ? "Live · 02:14" : "Call ended"}</p></div>
                </div>
                <Badge className="rounded-full bg-white/20 border-0 text-white">Qualifying</Badge>
              </div>
              <Waveform active={live} />
              <div className="flex items-center justify-center gap-3">
                <Button size="icon" variant="ghost" className="rounded-full bg-white/20 hover:bg-white/30 text-white w-12 h-12" onClick={() => toast.info("Muted")}><Mic className="w-5 h-5" /></Button>
                <Button data-testid="end-call-btn" size="icon" className="rounded-full bg-neutral-500 hover:bg-neutral-600 w-14 h-14" onClick={() => { setLive(false); toast.success("Call ended · Meeting booked"); }}><PhoneOff className="w-6 h-6" /></Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5">
            <h4 className="font-heading font-semibold mb-4">Live Transcript</h4>
            <div className="space-y-3">
              {transcript.slice(0, visible).map((t, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${t.speaker === "AI" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${t.speaker === "AI" ? "bg-neutral-50 dark:bg-neutral-500/10 text-neutral-700 dark:text-neutral-200" : "bg-neutral-100 dark:bg-neutral-800"}`}>
                    <span className="text-[10px] font-semibold text-neutral-400 block">{t.speaker}</span>{t.text}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5">
            <h4 className="font-heading font-semibold mb-4">Live Analysis</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">Sentiment</span><Badge className="rounded-full border-0 bg-neutral-100 text-neutral-700">Positive</Badge></div>
              <div className="flex justify-between items-center"><span className="text-neutral-500">Qualification</span><div className="flex items-center gap-2"><span className="font-semibold">82</span><div className="w-16 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden"><div className="h-full bg-white text-black w-[82%]" /></div></div></div>
              <div className="flex justify-between"><span className="text-neutral-500">Objection detected</span><span className="font-medium">Pricing</span></div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5">
            <h4 className="font-heading font-semibold mb-4">Call History</h4>
            <div className="space-y-2">
              {calls.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2 border-b border-neutral-100 dark:border-white/10 last:border-0" data-testid={`call-history-${c.id}`}>
                  <Button size="icon" variant="ghost" className="rounded-lg w-8 h-8 shrink-0" onClick={() => toast.info(`Playing recording · ${c.contact}`)}><Play className="w-4 h-4" /></Button>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{c.contact}</p><p className="text-xs text-neutral-400">{c.company} · {c.duration}</p></div>
                  <Badge className={`rounded-full border-0 text-xs ${sentimentColor[c.sentiment]}`}>{c.sentiment}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
