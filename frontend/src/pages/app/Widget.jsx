import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Save, Copy, Check, Code2, Palette, MessageSquare, RefreshCw,
  KeyRound, ClipboardList, User, Mail, Phone, ExternalLink,
} from "lucide-react";
import { PageHeader, ErrorState } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { widgetApi } from "@/lib/backend";
import { toast } from "sonner";

const FIELD_META = {
  name: { label: "Name", icon: User },
  email: { label: "Email", icon: Mail },
  phone: { label: "Phone", icon: Phone },
};
const ALL_FIELDS = ["name", "email", "phone"];

// The "Website Widget" dashboard section: shows the embed snippet, lets the org
// configure the bot's greeting / colour / capture fields / active state / monthly
// cap, tracks message usage vs cap, and lists captured widget conversations.
export default function Widget() {
  const [cfg, setCfg] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      setCfg(await widgetApi.getConfig());
      setState("ready");
    } catch (e) {
      setError(e.message); setState("error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (state === "loading") {
    return (
      <div>
        <PageHeader title="Website Widget" subtitle="An AI chat bot for your own website" testid="widget-header" />
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 flex items-center justify-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading widget…
        </div>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div>
        <PageHeader title="Website Widget" subtitle="An AI chat bot for your own website" testid="widget-header" />
        <ErrorState title="Couldn’t load the widget" message={error} onRetry={load} testid="widget-error" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Website Widget"
        subtitle="An AI chat bot for your own website — answers from your knowledge base and captures leads"
        testid="widget-header"
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <EmbedCard cfg={cfg} onChange={setCfg} />
          <ConfigCard cfg={cfg} onChange={setCfg} />
          <ConversationsCard />
        </div>
        <div className="space-y-6">
          <UsageCard cfg={cfg} />
          <PreviewCard cfg={cfg} />
        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 ${className}`}>
      {children}
    </div>
  );
}
function CardTitle({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
        <h4 className="font-heading font-semibold">{children}</h4>
      </div>
      {action}
    </div>
  );
}

// ── Embed snippet + key management ───────────────────────────────────────────
function EmbedCard({ cfg, onChange }) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const snippet = widgetApi.embedSnippet(cfg.widget_key);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
      toast.success("Embed snippet copied");
    } catch {
      toast.error("Couldn’t copy — select the text manually");
    }
  };

  const rotate = async () => {
    setRotating(true);
    try {
      const next = await widgetApi.rotateKey();
      onChange(next);
      toast.success("New key generated", { description: "Update the snippet on your site." });
    } catch (e) {
      toast.error("Couldn’t rotate key", { description: e.message });
    } finally {
      setRotating(false); setConfirmRotate(false);
    }
  };

  return (
    <Card>
      <CardTitle icon={Code2}>Embed on your website</CardTitle>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">
        Paste this snippet just before <code className="px-1 rounded bg-neutral-100 dark:bg-neutral-800">&lt;/body&gt;</code> on
        any page. It loads a chat bubble that answers from your knowledge base.
      </p>
      <div className="relative">
        <pre data-testid="widget-embed" className="rounded-xl bg-neutral-950 text-neutral-100 text-xs p-4 pr-12 overflow-x-auto leading-relaxed">
          <code>{snippet}</code>
        </pre>
        <Button size="icon" variant="ghost" onClick={copy} data-testid="widget-copy"
          className="absolute top-2 right-2 h-8 w-8 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-xs text-neutral-400 flex items-center gap-1.5 min-w-0">
          <KeyRound className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono truncate">{cfg.widget_key}</span>
        </div>
        {confirmRotate ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-neutral-500">Replace the key?</span>
            <Button size="sm" variant="ghost" className="rounded-full h-8" onClick={() => setConfirmRotate(false)} disabled={rotating}>Cancel</Button>
            <Button size="sm" data-testid="widget-rotate-confirm" className="rounded-full h-8 bg-neutral-900 text-white dark:bg-white dark:text-black" onClick={rotate} disabled={rotating}>
              {rotating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Rotate"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="rounded-full h-8 shrink-0" data-testid="widget-rotate" onClick={() => setConfirmRotate(true)}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Rotate key
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── Appearance & behaviour config ────────────────────────────────────────────
function ConfigCard({ cfg, onChange }) {
  const [greeting, setGreeting] = useState(cfg.greeting_message || "");
  const [color, setColor] = useState(cfg.primary_color || "#4f46e5");
  const [fields, setFields] = useState(cfg.capture_fields || ALL_FIELDS);
  const [cap, setCap] = useState(String(cfg.monthly_message_cap ?? 1000));
  const [saving, setSaving] = useState(false);

  const validColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
  const capNum = parseInt(cap, 10);
  const validCap = Number.isFinite(capNum) && capNum >= 0;
  const dirty =
    greeting !== (cfg.greeting_message || "") ||
    color !== (cfg.primary_color || "#4f46e5") ||
    JSON.stringify(fields) !== JSON.stringify(cfg.capture_fields || ALL_FIELDS) ||
    capNum !== (cfg.monthly_message_cap ?? 1000);
  const canSave = dirty && validColor && validCap && greeting.trim().length > 0 && !saving;

  const toggleField = (f) =>
    setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : ALL_FIELDS.filter((x) => cur.includes(x) || x === f)));

  const setActive = async (value) => {
    try {
      onChange(await widgetApi.updateConfig({ is_active: value }));
      toast.success(value ? "Widget activated" : "Widget paused");
    } catch (e) {
      toast.error("Couldn’t update", { description: e.message });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await widgetApi.updateConfig({
        greeting_message: greeting.trim(),
        primary_color: color,
        capture_fields: fields.length ? fields : ALL_FIELDS,
        monthly_message_cap: capNum,
      });
      onChange(next);
      toast.success("Widget settings saved");
    } catch (e) {
      toast.error("Couldn’t save", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardTitle icon={Palette} action={
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">{cfg.is_active ? "Active" : "Paused"}</span>
          <Switch checked={!!cfg.is_active} onCheckedChange={setActive} data-testid="widget-active" />
        </div>
      }>
        Appearance & behaviour
      </CardTitle>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Greeting message</Label>
          <Textarea data-testid="widget-greeting" rows={2} value={greeting} maxLength={500}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Hi! 👋 How can I help you today?" className="rounded-xl text-sm" />
        </div>

        <div className="space-y-1.5">
          <Label>Primary colour</Label>
          <div className="flex items-center gap-2">
            <input type="color" aria-label="Primary colour" value={validColor ? color : "#4f46e5"}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 rounded-lg border border-neutral-200 dark:border-white/10 bg-transparent cursor-pointer" />
            <Input data-testid="widget-color" value={color} onChange={(e) => setColor(e.target.value)}
              className={`rounded-xl w-36 font-mono ${validColor ? "" : "border-red-400"}`} maxLength={7} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Contact fields to collect</Label>
          <div className="flex flex-wrap gap-2">
            {ALL_FIELDS.map((f) => {
              const on = fields.includes(f);
              const Icon = FIELD_META[f].icon;
              return (
                <button key={f} type="button" data-testid={`widget-field-${f}`} onClick={() => toggleField(f)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-sm border transition-colors ${
                    on ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-black dark:border-white"
                       : "bg-transparent text-neutral-500 border-neutral-200 dark:border-white/15 hover:border-neutral-400"}`}>
                  <Icon className="w-3.5 h-3.5" /> {FIELD_META[f].label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-neutral-400">Shown in the "leave your details" form. Email or phone is always required from the visitor.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Monthly message cap</Label>
          <Input data-testid="widget-cap" type="number" min={0} value={cap}
            onChange={(e) => setCap(e.target.value)} className={`rounded-xl w-40 ${validCap ? "" : "border-red-400"}`} />
          <p className="text-xs text-neutral-400">
            The bot stops answering (and stops incurring AI cost) for the rest of the month once this many replies are sent. It still offers to take contact details.
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <Button data-testid="widget-save" onClick={save} disabled={!canSave}
            className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-1" /> Save changes</>}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Usage vs cap ─────────────────────────────────────────────────────────────
function UsageCard({ cfg }) {
  const usage = cfg.usage || { used: 0, cap: cfg.monthly_message_cap || 0, remaining: 0 };
  const cap = usage.cap || cfg.monthly_message_cap || 0;
  const pct = cap > 0 ? Math.min(100, Math.round((usage.used / cap) * 100)) : 0;
  const hot = pct >= 90;

  return (
    <Card>
      <CardTitle icon={MessageSquare}>This month’s usage</CardTitle>
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="text-3xl font-heading font-semibold tabular-nums" data-testid="widget-usage-used">{usage.used.toLocaleString()}</div>
          <div className="text-xs text-neutral-400">AI replies of {cap.toLocaleString()} cap</div>
        </div>
        <Badge className={`rounded-full border-0 font-normal ${hot ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>
          {usage.remaining.toLocaleString()} left
        </Badge>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div className={`h-full rounded-full ${hot ? "bg-red-500" : "bg-neutral-900 dark:bg-white"}`} style={{ width: `${pct}%` }} />
      </div>
      {hot && <p className="mt-2 text-xs text-red-600 dark:text-red-400">Approaching the cap — raise it in settings if you need more headroom.</p>}
    </Card>
  );
}

// ── Live preview ─────────────────────────────────────────────────────────────
function PreviewCard({ cfg }) {
  const color = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cfg.primary_color) ? cfg.primary_color : "#4f46e5";
  return (
    <Card>
      <CardTitle icon={ExternalLink}>Preview</CardTitle>
      <div className="rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden bg-neutral-50 dark:bg-neutral-900/40">
        <div className="px-4 py-3 text-white text-sm font-semibold" style={{ background: color }}>Chat</div>
        <div className="p-4 space-y-2">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 px-3 py-2 text-sm">
            {cfg.greeting_message || "Hi! How can I help you today?"}
          </div>
          <div className="max-w-[85%] ml-auto rounded-2xl rounded-br-sm px-3 py-2 text-sm text-white" style={{ background: color }}>
            What are your hours?
          </div>
        </div>
        <div className="border-t border-neutral-200 dark:border-white/10 p-2 flex items-center gap-2">
          <div className="flex-1 h-8 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10" />
          <div className="w-8 h-8 rounded-full" style={{ background: color }} />
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-400">Not active yet? Toggle the widget on above, then load your site.</p>
    </Card>
  );
}

// ── Captured conversations ───────────────────────────────────────────────────
function ConversationsCard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // conversation id being expanded

  useEffect(() => {
    (async () => {
      try { setRows(await widgetApi.conversations()); }
      catch { /* keep empty */ }
      finally { setLoading(false); }
    })();
  }, []);

  const captured = useMemo(() => rows.filter((r) => r.visitor_email || r.visitor_phone || r.converted_lead_id).length, [rows]);

  return (
    <Card>
      <CardTitle icon={ClipboardList} action={
        <span className="text-xs text-neutral-400">{rows.length} conversation{rows.length === 1 ? "" : "s"} · {captured} captured</span>
      }>
        Conversations
      </CardTitle>

      {loading ? (
        <div className="py-10 flex items-center justify-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-neutral-500">
          No conversations yet. Once visitors chat on your site, they’ll appear here.
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-white/5">
          {rows.map((c) => {
            const msgs = Array.isArray(c.messages) ? c.messages : [];
            const contact = c.visitor_name || c.visitor_email || c.visitor_phone;
            const expanded = open === c.id;
            return (
              <div key={c.id} className="py-3" data-testid={`widget-convo-${c.id}`}>
                <button className="w-full flex items-center justify-between gap-3 text-left"
                  onClick={() => setOpen(expanded ? null : c.id)}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{contact || "Anonymous visitor"}</span>
                      {c.converted_lead_id && (
                        <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 font-normal text-[11px]">Lead</Badge>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400 truncate">
                      {msgs.length} message{msgs.length === 1 ? "" : "s"} · {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-neutral-400">
                    {c.visitor_email && <span className="hidden sm:flex items-center gap-1"><Mail className="w-3 h-3" />{c.visitor_email}</span>}
                    {c.visitor_phone && <span className="hidden sm:flex items-center gap-1"><Phone className="w-3 h-3" />{c.visitor_phone}</span>}
                  </div>
                </button>

                {expanded && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 space-y-2 pl-1">
                    {msgs.length === 0 && <p className="text-xs text-neutral-400">No messages recorded.</p>}
                    {msgs.map((m, i) => (
                      <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        m.role === "user"
                          ? "ml-auto bg-neutral-900 text-white dark:bg-white dark:text-black rounded-br-sm"
                          : "bg-neutral-100 dark:bg-neutral-800 rounded-bl-sm"}`}>
                        {m.content}
                      </div>
                    ))}
                    {c.converted_lead_id && (
                      <a href={`/app/leads/${c.converted_lead_id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-neutral-900 dark:text-white hover:underline">
                        View lead <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
