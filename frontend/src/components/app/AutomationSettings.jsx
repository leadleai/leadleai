import { useEffect, useMemo, useState } from "react";
import {
  PhoneCall, Mail, Clock, Sparkles, Search, Loader2, AlertTriangle,
  Save, RotateCcw, Timer, Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { orgSettingsApi } from "@/lib/backend";
import { toast } from "sonner";

// The fields this editor owns (everything the sweeps read per-org). Deployment
// flags (bland_configured, etc.) are read-only and come back alongside these.
const EDITABLE = [
  "auto_call_enabled", "auto_call_delay_seconds", "dedupe_minutes",
  "quiet_start", "quiet_end", "timezone",
  "followup_enabled", "followup_from_email", "followup_schedule_hours",
  "agent_name", "kb_matching_enabled", "ai_emails_enabled",
  "auto_call_sweep_seconds", "followup_sweep_seconds",
];

const COMMON_TZS = [
  "Asia/Kolkata", "UTC", "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney",
];

const pick = (obj) => Object.fromEntries(EDITABLE.map((k) => [k, obj[k]]));

// Editable-fields snapshot for the form/dirty tracking, with time fields coerced
// to "HH:MM" so the native pickers always render them (see toTimeInput). Used for
// both the initial GET and the post-save response, so snapshots compare cleanly.
const snapshot = (data) => {
  const e = pick(data);
  e.quiet_start = toTimeInput(e.quiet_start);
  e.quiet_end = toTimeInput(e.quiet_end);
  return e;
};

// A native <input type="time"> only shows/accepts an "HH:MM" value. Coerce
// whatever the API returns (e.g. "9:0", "09:00:00", padded, or null) into that
// shape so the stored value always displays and stays editable/saveable.
const toTimeInput = (v) => {
  if (v == null) return "";
  const m = String(v).trim().match(/^(\d{1,2}):(\d{1,2})/);
  if (!m) return "";
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const min = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};
const hoursToDays = (h) => {
  const n = Number(h);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = n / 24;
  return Number.isInteger(d) ? `${d} day${d === 1 ? "" : "s"}` : `${d.toFixed(1)} days`;
};

export default function AutomationSettings() {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [flags, setFlags] = useState({});
  const [initial, setInitial] = useState(null); // last-saved snapshot (editable fields)
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setState("loading"); setError(null);
    try {
      const data = await orgSettingsApi.get();
      const editable = snapshot(data);
      setInitial(editable);
      setForm(editable);
      setFlags(data);
      setState("ready");
    } catch (e) { setError(e.message); setState("error"); }
  };
  useEffect(() => { load(); }, []);

  const dirty = useMemo(
    () => initial && JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial]
  );

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setNum = (key, value) => set(key, value === "" ? "" : Number(value));
  const setSchedule = (idx, value) =>
    setForm((f) => {
      const next = [...(f.followup_schedule_hours || [])];
      next[idx] = value === "" ? "" : Number(value);
      return { ...f, followup_schedule_hours: next };
    });

  const save = async () => {
    // Build a clean payload: drop blank schedule slots, coerce from-email blank -> null.
    const schedule = (form.followup_schedule_hours || [])
      .map((h) => Number(h))
      .filter((h) => Number.isFinite(h) && h > 0);
    if (schedule.length < 1) { toast.error("Add at least one follow-up time."); return; }

    const payload = {
      ...pick(form),
      followup_schedule_hours: schedule,
      followup_from_email: (form.followup_from_email || "").trim() || null,
      agent_name: (form.agent_name || "").trim(),
    };

    setSaving(true);
    try {
      const data = await orgSettingsApi.update(payload);
      const editable = snapshot(data);
      setInitial(editable);
      setForm(editable);
      setFlags(data);
      toast.success("Automation settings saved", {
        description: "Takes effect on the next sweep — no restart needed.",
      });
    } catch (e) {
      toast.error("Couldn’t save settings", { description: e.message });
    } finally { setSaving(false); }
  };

  if (state === "loading") {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading automation settings…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 max-w-2xl text-sm">
        <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white"><AlertTriangle className="w-4 h-4" /> Couldn’t load settings</div>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl pb-24">
      {/* Auto-calling */}
      <Card>
        <CardHead icon={PhoneCall} title="Auto-call new leads"
          desc="When a lead submits the enquiry form, the AI calls them after a short delay — within the allowed hours, once per lead." />
        <ToggleRow label="Enable auto-calling" checked={!!form.auto_call_enabled}
          onChange={(v) => set("auto_call_enabled", v)}
          badge={form.auto_call_enabled ? "ON" : "OFF"} />
        {!flags.bland_configured && (
          <Warn>BLAND_API_KEY isn’t set — auto-calls will fail until it’s configured in backend/.env.</Warn>
        )}
        <div className="grid sm:grid-cols-2 gap-4 pt-1">
          <Field label="Delay before calling" hint="Seconds after the lead is created">
            <NumberInput value={form.auto_call_delay_seconds} min={0} max={86400}
              onChange={(v) => setNum("auto_call_delay_seconds", v)} suffix="sec" testid="delay-input" />
          </Field>
          <Field label="Don’t call the same number twice within" hint="Dedupe window">
            <NumberInput value={form.dedupe_minutes} min={0} max={10080}
              onChange={(v) => setNum("dedupe_minutes", v)} suffix="min" testid="dedupe-input" />
          </Field>
          <Field label="AI agent name" hint="How the voice agent introduces itself" className="sm:col-span-2">
            <Input value={form.agent_name || ""} onChange={(e) => set("agent_name", e.target.value)}
              className="rounded-xl" maxLength={80} data-testid="agent-name-input" placeholder="Ava" />
          </Field>
        </div>
      </Card>

      {/* Quiet hours (shared) */}
      <Card>
        <CardHead icon={Clock} title="Allowed hours"
          desc="Calls and follow-up emails only go out inside this window, in your timezone. A window that ends before it starts wraps past midnight." />
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="From">
            <Input type="time" value={form.quiet_start || ""} onChange={(e) => set("quiet_start", e.target.value)}
              className="rounded-xl" style={{ colorScheme: "light dark" }} data-testid="quiet-start-input" />
          </Field>
          <Field label="To">
            <Input type="time" value={form.quiet_end || ""} onChange={(e) => set("quiet_end", e.target.value)}
              className="rounded-xl" style={{ colorScheme: "light dark" }} data-testid="quiet-end-input" />
          </Field>
          <Field label="Timezone">
            <Input list="tz-list" value={form.timezone || ""} onChange={(e) => set("timezone", e.target.value)}
              className="rounded-xl" data-testid="timezone-input" placeholder="Asia/Kolkata" />
            <datalist id="tz-list">{COMMON_TZS.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
        </div>
      </Card>

      {/* Follow-up emails */}
      <Card>
        <CardHead icon={Mail} title="Follow-up emails"
          desc="Up to 3 follow-ups after an enquiry, then stop. Stops early if the lead replies (interested / meeting booked / closed) or unsubscribes. Every email includes an unsubscribe link." />
        <ToggleRow label="Enable follow-up emails" checked={!!form.followup_enabled}
          onChange={(v) => set("followup_enabled", v)}
          badge={form.followup_enabled ? "ON" : "OFF"} />
        {!flags.resend_configured && (
          <Warn>RESEND_API_KEY isn’t set — follow-up emails can’t be sent until it’s configured in backend/.env.</Warn>
        )}
        <Field label="Send from" hint={flags.env_from_email ? `Blank uses the deployment default (${flags.env_from_email})` : "Blank uses the deployment default"} className="pt-1">
          <Input type="email" value={form.followup_from_email || ""} onChange={(e) => set("followup_from_email", e.target.value)}
            className="rounded-xl" data-testid="from-email-input" placeholder={flags.env_from_email || "you@yourdomain.com"} />
        </Field>

        <div className="pt-2">
          <Label className="text-sm">Follow-up schedule</Label>
          <p className="text-xs text-neutral-400 mb-2">Hours after the enquiry that each email goes out (e.g. 24 / 72 / 168 = day 1 / 3 / 7).</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => {
              const val = (form.followup_schedule_hours || [])[i];
              return (
                <Field key={i} label={`${["1st", "2nd", "3rd"][i]} follow-up`} hint={hoursToDays(val) || "leave blank to skip"}>
                  <NumberInput value={val ?? ""} min={0} step="0.01"
                    onChange={(v) => setSchedule(i, v)} suffix="hrs" testid={`schedule-${i}`} />
                </Field>
              );
            })}
          </div>
        </div>

        <div className="pt-2 space-y-3">
          <ToggleRow small icon={Search} label="Knowledge-base matching"
            desc="Answer each lead’s enquiry from your Knowledge Base using rule-based keyword matching."
            checked={!!form.kb_matching_enabled} onChange={(v) => set("kb_matching_enabled", v)} />
          <ToggleRow small icon={Sparkles} label="AI-written follow-ups"
            desc={<>Write each email with AI, grounded only in your <a href="/app/knowledge" className="underline underline-offset-2">Knowledge Base</a>. When off, follow-ups use keyword matching instead.</>}
            checked={!!form.ai_emails_enabled} disabled={!flags.ai_configured}
            onChange={(v) => set("ai_emails_enabled", v)} />
          {!flags.ai_configured && (
            <Warn>AI not configured — set ANTHROPIC_API_KEY in backend/.env to enable AI-written follow-ups.</Warn>
          )}
        </div>
      </Card>

      {/* Sweep frequency (advanced) */}
      <Card>
        <CardHead icon={Gauge} title="Checker frequency (advanced)"
          desc="How often the background checker looks for leads to call / email for this org." />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Auto-call check runs every">
            <NumberInput value={form.auto_call_sweep_seconds} min={5} max={86400}
              onChange={(v) => setNum("auto_call_sweep_seconds", v)} suffix="sec" testid="autocall-sweep-input" />
          </Field>
          <Field label="Follow-up check runs every">
            <NumberInput value={form.followup_sweep_seconds} min={5} max={86400}
              onChange={(v) => setNum("followup_sweep_seconds", v)} suffix="sec" testid="followup-sweep-input" />
          </Field>
        </div>
        <p className="text-xs text-neutral-400 flex items-start gap-1.5 pt-1">
          <Timer className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Honest limit: the checker is a single shared loop, so an org is never checked
          more often than the loop ticks. The loop speeds up to the smallest interval
          set across all orgs (with a safety floor), and larger values here are honoured
          precisely. On serverless deploys the cadence is bounded by the external
          scheduler instead.
        </p>
      </Card>

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10">
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white/90 dark:bg-neutral-900/90 backdrop-blur p-3 flex items-center gap-3 shadow-sm">
          <p className="text-sm text-neutral-500 flex-1">
            {dirty ? "Unsaved changes — these take effect on the next sweep." : "All changes saved."}
          </p>
          {dirty && (
            <Button variant="ghost" className="rounded-full" disabled={saving}
              onClick={() => setForm(initial)} data-testid="reset-btn">
              <RotateCcw className="w-4 h-4 mr-1" /> Reset
            </Button>
          )}
          <Button className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black"
            disabled={!dirty || saving} onClick={save} data-testid="save-automation-btn">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── little presentational helpers (match the existing Settings styling) ──────
function Card({ children }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 space-y-4">
      {children}
    </div>
  );
}

function CardHead({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-5 h-5 text-neutral-400 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{desc}</p>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange, disabled, badge, small, icon: Icon }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${small ? "rounded-xl border border-neutral-200 dark:border-white/10 p-4" : ""}`}>
      <div className="flex items-start gap-3">
        {Icon && <Icon className="w-5 h-5 text-neutral-400 mt-0.5 shrink-0" />}
        <div>
          <p className="font-medium text-sm">{label}</p>
          {desc && <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">{desc}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <Badge className={`rounded-full border-0 ${checked
            ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>{badge}</Badge>
        )}
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange}
          data-testid={`toggle-${(label || "").toLowerCase().replace(/[^a-z]+/g, "-")}`} />
      </div>
    </div>
  );
}

function Field({ label, hint, children, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = "1", suffix, testid }) {
  return (
    <div className="relative">
      <Input type="number" value={value ?? ""} min={min} max={max} step={step}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl pr-12" data-testid={testid} />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">{suffix}</span>}
    </div>
  );
}

function Warn({ children }) {
  return (
    <p className="text-xs text-amber-600 dark:text-amber-500/90 flex items-start gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {children}
    </p>
  );
}
