import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Mail, Phone as PhoneIcon, Building2, Calendar, Loader2, Inbox,
  MessageSquare, Flag, CheckCircle2, XCircle, Zap, FileText, StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/Primitives";
import CallButton from "@/components/app/CallButton";
import FollowupButton from "@/components/app/FollowupButton";
import LeadTags from "@/components/app/LeadTags";
import LeadNotes from "@/components/app/LeadNotes";
import LeadCustomFields from "@/components/app/LeadCustomFields";
import { leadsApi, LEAD_STATUSES } from "@/lib/backend";
import { toast } from "sonner";

// Same monochrome status treatments as the leads list — meaning carried by
// label + fill weight, no hue.
const STATUS_META = {
  new: { label: "New", cls: "bg-neutral-900 text-white dark:bg-white dark:text-black border-transparent" },
  contacted: { label: "Contacted", cls: "border border-neutral-300 dark:border-white/25 bg-transparent text-neutral-700 dark:text-neutral-200" },
  interested: { label: "Interested", cls: "border border-neutral-400 dark:border-white/40 bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white" },
  meeting_booked: { label: "Meeting booked", cls: "border border-neutral-900 dark:border-white bg-transparent text-neutral-900 dark:text-white font-semibold" },
  closed: { label: "Closed", cls: "border border-neutral-200 dark:border-white/15 bg-transparent text-muted-foreground" },
};

const statusLabel = (s) => STATUS_META[s]?.label || s || "—";
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString() : "—");

// Icon + accent for each timeline entry `type` (and call/email outcome). Failed
// attempts get a hollow/subdued treatment so a red-free feed still reads at a glance.
function eventVisual(ev) {
  const failed = ev.outcome === "failed";
  switch (ev.type) {
    case "enquiry":
      return { Icon: Inbox };
    case "call":
      return { Icon: failed ? XCircle : PhoneIcon };
    case "email":
      return { Icon: failed ? XCircle : Mail };
    case "status":
      return { Icon: ev.outcome === "closed" ? CheckCircle2 : Flag };
    case "note":
      return { Icon: StickyNote };
    default:
      return { Icon: MessageSquare };
  }
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [activity, setActivity] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      // The lead is required; activity is best-effort so a timeline hiccup
      // doesn't blank out the whole page.
      const leadData = await leadsApi.get(id);
      setLead(leadData);
      try {
        const acts = await leadsApi.activity(id);
        setActivity(Array.isArray(acts) ? acts : []);
      } catch {
        setActivity([]);
      }
      setState("ready");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (status) => {
    if (!lead || status === lead.status) return;
    const prev = lead.status;
    setLead((l) => ({ ...l, status })); // optimistic
    try {
      const updated = await leadsApi.updateStatus(lead.id, status);
      // The PATCH response doesn't re-embed tags — keep the ones we already have.
      setLead((l) => ({ ...updated, tags: l.tags || [] }));
      toast.success(`${lead.name} → ${statusLabel(status)}`);
      // A status change is itself a timeline event — refresh the feed.
      leadsApi.activity(id).then((a) => setActivity(Array.isArray(a) ? a : [])).catch(() => {});
    } catch (e) {
      setLead((l) => ({ ...l, status: prev }));
      toast.error(e.message);
    }
  };

  // Notes are also timeline events — refresh the feed when one is added/removed.
  const refreshActivity = useCallback(() => {
    leadsApi.activity(id).then((a) => setActivity(Array.isArray(a) ? a : [])).catch(() => {});
  }, [id]);

  const statusMeta = useMemo(() => (lead ? STATUS_META[lead.status] || STATUS_META.new : null), [lead]);

  return (
    <div className="max-w-4xl">
      <button
        onClick={() => navigate("/app/leads")}
        data-testid="lead-detail-back"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-neutral-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to leads
      </button>

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading lead…
        </div>
      )}

      {state === "error" && (
        <ErrorState title="Couldn’t load this lead" message={error} onRetry={load} testid="lead-detail-error">
          <Link to="/app/leads" className="mt-3 inline-block text-sm underline underline-offset-4">Back to all leads</Link>
        </ErrorState>
      )}

      {state === "ready" && lead && (
        <div className="space-y-6">
          {/* ── Header: identity + status + actions ──────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6"
            data-testid="lead-detail-card"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-semibold tracking-tight">{lead.name}</h1>
                  {statusMeta && <Badge className={`rounded-full font-medium ${statusMeta.cls}`}>{statusMeta.label}</Badge>}
                  {lead.auto_called_at && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black px-2 py-0.5 text-xs font-medium">
                      <Zap className="w-3 h-3" /> Auto-called
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <LeadTags
                    leadId={lead.id}
                    tags={lead.tags || []}
                    onChange={(tags) => setLead((l) => ({ ...l, tags }))}
                  />
                </div>
                <div className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white">
                    <PhoneIcon className="w-4 h-4 shrink-0 text-neutral-400" /> {lead.phone}
                  </a>
                  <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white break-all">
                    <Mail className="w-4 h-4 shrink-0 text-neutral-400" /> {lead.email}
                  </a>
                  <span className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                    <Building2 className="w-4 h-4 shrink-0 text-neutral-400" /> {lead.company || "—"}
                  </span>
                  <span className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                    <FileText className="w-4 h-4 shrink-0 text-neutral-400" /> Source: {lead.source || "inbound"}
                  </span>
                  <span className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                    <Calendar className="w-4 h-4 shrink-0 text-neutral-400" /> Created {fmtDateTime(lead.created_at)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end shrink-0">
                <CallButton lead={lead} />
                <FollowupButton lead={lead} onSent={load} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Status
                  <select
                    data-testid="lead-detail-status"
                    value={lead.status}
                    onChange={(e) => changeStatus(e.target.value)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-white/[0.02] px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 outline-none"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>{statusLabel(s)}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Original enquiry text */}
            <div className="mt-5 rounded-xl border border-neutral-100 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] p-4">
              <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">Enquiry</p>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{lead.enquiry}</p>
            </div>
          </motion.div>

          {/* ── Custom fields (org-defined) ──────────────────────────────── */}
          <LeadCustomFields leadId={lead.id} />

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <LeadNotes leadId={lead.id} onChanged={refreshActivity} />

          {/* ── Activity timeline ────────────────────────────────────────── */}
          <div data-testid="lead-activity">
            <h2 className="font-heading font-semibold text-lg mb-4">Activity timeline</h2>
            {activity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/10 bg-white dark:bg-white/[0.02] py-12 text-center text-sm text-muted-foreground">
                No activity recorded yet.
              </div>
            ) : (
              <ol className="relative border-l border-neutral-200 dark:border-white/10 ml-3">
                {activity.map((ev, i) => {
                  const { Icon } = eventVisual(ev);
                  const failed = ev.outcome === "failed";
                  return (
                    <motion.li
                      key={ev.id}
                      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i, 12) * 0.04, type: "spring", stiffness: 260, damping: 24 }}
                      className="relative ml-6 pb-6 last:pb-0"
                      data-testid={`activity-${ev.type}`}
                    >
                      <span className={`absolute -left-[2.1rem] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white dark:ring-[#0a0a0a] ${
                        failed
                          ? "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                          : "bg-neutral-900 text-white dark:bg-white dark:text-black"
                      }`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="text-sm font-medium text-neutral-900 dark:text-white">{ev.title}</p>
                        <time className="text-xs text-muted-foreground">{fmtDateTime(ev.timestamp)}</time>
                      </div>
                      {ev.detail && (
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-words">{ev.detail}</p>
                      )}
                      {ev.type === "call" && ev.meta?.call_id && (
                        <p className="mt-1 text-xs font-mono text-muted-foreground">Bland call · {ev.meta.call_id}</p>
                      )}
                    </motion.li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
