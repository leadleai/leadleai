import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, RefreshCw, Loader2, AlertTriangle, Inbox, Check, X, ChevronDown, ChevronRight, Save,
} from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { emailsApi } from "@/lib/backend";
import { toast } from "sonner";

export default function Emails() {
  return (
    <div>
      <PageHeader title="Emails" subtitle="Follow-up history and templates" testid="emails-header" />
      <Tabs defaultValue="log" className="space-y-6">
        <TabsList className="rounded-full">
          <TabsTrigger value="log" data-testid="emails-tab-log" className="rounded-full">Log</TabsTrigger>
          <TabsTrigger value="templates" data-testid="emails-tab-templates" className="rounded-full">Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="log"><EmailLog /></TabsContent>
        <TabsContent value="templates"><EmailTemplates /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── (A) Email log ────────────────────────────────────────────────────────────
function EmailLog() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all"); // all | sent | failed
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      const data = await emailsApi.list();
      setRows(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (e) {
      setError(e.message); setState("error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchQ = !q || r.to_email?.toLowerCase().includes(q) || r.subject?.toLowerCase().includes(q);
      const matchS = status === "all" || r.status === status;
      return matchQ && matchS;
    });
  }, [rows, query, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input data-testid="emails-search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by recipient or subject…" className="pl-9 rounded-xl" />
        </div>
        <div className="flex gap-2">
          {["all", "sent", "failed"].map((s) => (
            <Button key={s} size="sm" data-testid={`emails-filter-${s}`}
              variant={status === s ? "default" : "outline"}
              onClick={() => setStatus(s)}
              className={`rounded-full capitalize ${status === s ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}>
              {s}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="rounded-full" onClick={load} data-testid="emails-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {state === "ready" && (
        <p className="text-sm text-neutral-500">
          {filtered.length} of {rows.length} email{rows.length === 1 ? "" : "s"}
        </p>
      )}

      {state === "loading" && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 py-16 flex items-center justify-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading email history…
        </div>
      )}

      {state === "error" && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-6 text-sm" data-testid="emails-error">
          <div className="flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4" /> Couldn’t load email history
          </div>
          <p className="mt-1 text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
        </div>
      )}

      {state === "ready" && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 py-16 flex flex-col items-center text-center px-6" data-testid="emails-empty">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
            <Inbox className="w-6 h-6 text-neutral-500" />
          </div>
          <h3 className="font-heading font-semibold text-lg">{rows.length ? "No matching emails" : "No emails sent yet"}</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm">
            {rows.length ? "Try a different search or filter." : "Follow-ups sent automatically or from a lead will appear here."}
          </p>
        </div>
      )}

      {state === "ready" && filtered.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
          {filtered.map((r) => {
            const open = expanded === r.id;
            return (
              <div key={r.id} data-testid={`email-row-${r.id}`}>
                <button onClick={() => setExpanded(open ? null : r.id)}
                  className="w-full text-left p-4 flex items-start gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                  {open ? <ChevronDown className="w-4 h-4 mt-1 text-neutral-400 shrink-0" />
                        : <ChevronRight className="w-4 h-4 mt-1 text-neutral-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{r.to_email}</span>
                      <StatusBadge status={r.status} />
                      {r.step && (
                        <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                          {r.step === "manual" ? "Manual" : `Step ${r.step}`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 mt-0.5 truncate">{r.subject}</p>
                  </div>
                  <span className="text-xs text-neutral-400 shrink-0">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                  </span>
                </button>

                {open && (
                  <div className="px-4 pb-4 pl-11 space-y-3" data-testid={`email-expanded-${r.id}`}>
                    {r.error && (
                      <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
                        <span className="font-medium">Error:</span> {r.error}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
                      {r.from_email && <span>From: {r.from_email}</span>}
                      {r.provider_id && <span>Resend id: {r.provider_id}</span>}
                    </div>
                    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
                      <div
                        className="text-sm text-neutral-700 dark:text-neutral-300 [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-500 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
                        dangerouslySetInnerHTML={{ __html: r.body || "<em>(no body recorded)</em>" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const sent = status === "sent";
  return (
    <Badge className={`rounded-full border-0 font-medium ${sent
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"}`}>
      {sent ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
      {status}
    </Badge>
  );
}

// ── Template editing ─────────────────────────────────────────────────────────
function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      setTemplates(await emailsApi.getTemplates());
      setState("ready");
    } catch (e) { setError(e.message); setState("error"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const edit = (step, key, value) =>
    setTemplates((ts) => ts.map((t) => (t.step === step ? { ...t, [key]: value } : t)));

  const save = async () => {
    setSaving(true);
    try {
      setTemplates(await emailsApi.saveTemplates(templates));
      toast.success("Templates saved", { description: "New follow-ups will use these." });
    } catch (e) {
      toast.error("Couldn’t save templates", { description: e.message });
    } finally { setSaving(false); }
  };

  if (state === "loading") {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 py-16 flex items-center justify-center gap-2 text-sm text-neutral-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-6 text-sm">
        <div className="flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4" /> Couldn’t load templates
        </div>
        <p className="mt-1 text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
      </div>
    );
  }

  const labels = { 1: "Day 1 — gentle nudge", 2: "Day 3 — add value", 3: "Day 7 — final check-in" };
  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Used by the automatic drip and to pre-fill the compose window. Placeholders:{" "}
        <code className="text-xs">{"{first_name}"}</code>, <code className="text-xs">{"{enquiry}"}</code>, and{" "}
        <code className="text-xs">{"{kb_answer}"}</code> — the matched Knowledge Base entry, dropped in when
        the enquiry matches its keywords and cleanly omitted otherwise. An unsubscribe link is always appended.
      </p>

      {templates.map((t) => (
        <div key={t.step} data-testid={`template-${t.step}`}
          className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              Step {t.step}/3
            </Badge>
            <span className="text-xs text-neutral-400">{labels[t.step]}</span>
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input data-testid={`template-subject-${t.step}`} value={t.subject}
              onChange={(e) => edit(t.step, "subject", e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>Body <span className="text-neutral-400 font-normal">(HTML supported)</span></Label>
            <Textarea data-testid={`template-body-${t.step}`} value={t.body} rows={10}
              onChange={(e) => edit(t.step, "body", e.target.value)}
              className="rounded-xl font-mono text-xs leading-relaxed" />
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <Button data-testid="templates-save" onClick={save} disabled={saving}
          className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-2" /> Save templates</>}
        </Button>
      </div>
    </div>
  );
}
