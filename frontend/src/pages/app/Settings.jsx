import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Shield, CreditCard, Check, PhoneCall, Loader2, Clock, Mail, Sparkles } from "lucide-react";
import { settingsApi, followupApi, aiEmailsApi } from "@/lib/backend";
import { toast } from "sonner";

const team = [
  { name: "Alex Johnson", email: "alex@vertexlabs.io", role: "Owner" },
  { name: "Maria Santos", email: "maria@vertexlabs.io", role: "Admin" },
  { name: "Tom Becker", email: "tom@vertexlabs.io", role: "Member" },
];

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your workspace, team, and preferences" testid="settings-header" />
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="rounded-full flex-wrap h-auto">
          {["profile", "automation", "organization", "billing", "team", "security", "notifications"].map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`settings-tab-${t}`} className="rounded-full capitalize">{t}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="w-16 h-16"><AvatarFallback className="bg-neutral-900 border border-neutral-800 text-white text-xl">AJ</AvatarFallback></Avatar>
              <Button variant="outline" className="rounded-full" onClick={() => toast.success("Photo updated")}>Change photo</Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>First name</Label><Input defaultValue="Alex" className="rounded-xl" data-testid="settings-firstname" /></div>
              <div className="space-y-2"><Label>Last name</Label><Input defaultValue="Johnson" className="rounded-xl" /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Email</Label><Input defaultValue="alex@vertexlabs.io" className="rounded-xl" /></div>
            </div>
            <Button data-testid="save-profile-btn" onClick={() => toast.success("Profile saved")} className="mt-6 rounded-full bg-white text-black">Save changes</Button>
          </div>
        </TabsContent>

        <TabsContent value="automation">
          <div className="space-y-6">
            <AutoCallSettings />
            <FollowupSettings />
          </div>
        </TabsContent>

        <TabsContent value="organization">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl space-y-4">
            <div className="space-y-2"><Label>Organization name</Label><Input defaultValue="Vertex Labs" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Website</Label><Input defaultValue="vertexlabs.io" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Custom domain</Label><Input defaultValue="mail.vertexlabs.io" className="rounded-xl" /></div>
            <Button onClick={() => toast.success("Organization updated")} className="rounded-full bg-white text-black">Save</Button>
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl">
            <div className="flex items-center justify-between rounded-xl bg-neutral-900 border border-neutral-800 p-5 text-white">
              <div><p className="text-white/80 text-sm">Current plan</p><p className="font-heading text-2xl font-bold">Growth · $399/mo</p></div>
              <CreditCard className="w-8 h-8 opacity-80" />
            </div>
            <div className="mt-5 space-y-2 text-sm">
              {["5,000 AI leads/mo", "AI email + call agents", "Full CRM automation"].map(f => <div key={f} className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300"><Check className="w-4 h-4 text-neutral-600" />{f}</div>)}
            </div>
            <div className="flex gap-3 mt-6">
              <Button data-testid="upgrade-plan-btn" onClick={() => toast.success("Upgrade flow started")} className="rounded-full bg-neutral-900 dark:bg-white dark:text-neutral-900">Upgrade plan</Button>
              <Button variant="outline" className="rounded-full" onClick={() => toast.info("Invoices opened")}>View invoices</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="team">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden max-w-2xl">
            <div className="flex items-center justify-between px-5 h-14 border-b border-neutral-200 dark:border-white/10">
              <span className="font-heading font-semibold">Team members</span>
              <Button size="sm" data-testid="invite-member-btn" onClick={() => toast.success("Invite sent")} className="rounded-full bg-white text-black">Invite</Button>
            </div>
            {team.map((m) => (
              <div key={m.email} className="flex items-center gap-3 px-5 py-3 border-b border-neutral-100 dark:border-white/10 last:border-0">
                <Avatar className="w-9 h-9"><AvatarFallback className="text-xs">{m.name.split(" ").map(n=>n[0]).join("")}</AvatarFallback></Avatar>
                <div className="flex-1"><p className="text-sm font-medium">{m.name}</p><p className="text-xs text-neutral-400">{m.email}</p></div>
                <Badge variant="secondary" className="rounded-full">{m.role}</Badge>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl space-y-4">
            {[["Two-factor authentication", "Add an extra layer of security", true], ["Single sign-on (SSO)", "Require SSO for all members", false], ["Session timeout", "Auto-logout after inactivity", true]].map(([t, d, on]) => (
              <div key={t} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3"><Shield className="w-5 h-5 text-neutral-400" /><div><p className="font-medium text-sm">{t}</p><p className="text-xs text-neutral-400">{d}</p></div></div>
                <Switch defaultChecked={on} onCheckedChange={() => toast.success(`${t} updated`)} data-testid={`security-${t.toLowerCase().replace(/[^a-z]/g,"-")}`} />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-500/30 bg-neutral-50/50 dark:bg-neutral-500/5 p-6 max-w-2xl mt-6" data-testid="danger-zone">
            <div className="flex items-center gap-2 text-neutral-600 mb-2"><AlertTriangle className="w-5 h-5" /><h4 className="font-heading font-semibold">Danger Zone</h4></div>
            <p className="text-sm text-neutral-500 mb-4">Permanently delete your workspace and all associated data. This cannot be undone.</p>
            <Button variant="destructive" className="rounded-full" data-testid="delete-workspace-btn" onClick={() => toast.error("Workspace deletion requires confirmation")}>Delete workspace</Button>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl space-y-4">
            {["Email sent", "Reply received", "Meeting booked", "Lead found", "Workflow completed", "Call completed"].map((n) => (
              <div key={n} className="flex items-center justify-between py-1.5">
                <p className="font-medium text-sm">{n}</p>
                <Switch defaultChecked onCheckedChange={() => toast.success(`${n} notifications updated`)} />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Auto-calling master switch — reads/writes GET|PUT /api/settings/auto-call.
function AutoCallSettings() {
  const [settings, setSettings] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setState("loading"); setError(null);
    try { setSettings(await settingsApi.getAutoCall()); setState("ready"); }
    catch (e) { setError(e.message); setState("error"); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (enabled) => {
    setSaving(true);
    try {
      setSettings(await settingsApi.setAutoCall(enabled));
      toast.success(enabled ? "Auto-calling enabled" : "Auto-calling disabled");
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (state === "loading") {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading auto-call settings…
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

  const q = settings.quiet_hours || {};
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <PhoneCall className="w-5 h-5 text-neutral-400 mt-0.5" />
          <div>
            <p className="font-medium">Automatically call new leads</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
              When a lead submits the enquiry form, the AI calls them after a short delay — within the allowed hours, once per lead.
            </p>
          </div>
        </div>
        <Switch data-testid="autocall-toggle" checked={!!settings.enabled} disabled={saving}
          onCheckedChange={toggle} />
      </div>

      <Badge className={`rounded-full border-0 ${settings.enabled ? "bg-neutral-900 text-white dark:bg-white dark:text-black" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>
        {settings.enabled ? "Auto-calling is ON" : "Auto-calling is OFF"}
      </Badge>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <Row label="Delay before calling" value={`${settings.delay_seconds}s`} />
        <Row label="Don’t call twice within" value={`${settings.dedupe_minutes} min`} />
        <Row label="Allowed hours" value={`${q.start}–${q.end}`} icon={Clock} />
        <Row label="Timezone" value={q.timezone} />
      </div>

      {!settings.bland_configured && (
        <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> BLAND_API_KEY isn’t set — auto-calls will fail until it’s configured in backend/.env.</p>
      )}
      {!settings.supabase_configured && (
        <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Supabase isn’t configured — leads can’t be read/updated.</p>
      )}
      <p className="text-xs text-neutral-400">Fine-tune the delay, hours and dedupe window via the AUTO_CALL_* variables in backend/.env. Manual calling from the Leads page always works regardless of this switch.</p>
    </div>
  );
}

// Follow-up email drip master switch — reads/writes GET|PUT /api/settings/followup.
function FollowupSettings() {
  const [settings, setSettings] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setState("loading"); setError(null);
    try { setSettings(await followupApi.getSettings()); setState("ready"); }
    catch (e) { setError(e.message); setState("error"); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (enabled) => {
    setSaving(true);
    try {
      setSettings(await followupApi.setSettings(enabled));
      toast.success(enabled ? "Follow-up emails enabled" : "Follow-up emails disabled");
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (state === "loading") {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading follow-up settings…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 max-w-2xl text-sm">
        <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white"><AlertTriangle className="w-4 h-4" /> Couldn’t load follow-up settings</div>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
      </div>
    );
  }

  const q = settings.quiet_hours || {};
  const schedule = (settings.schedule_hours || []).map((h) => `${h}h`).join(" → ");
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 text-neutral-400 mt-0.5" />
          <div>
            <p className="font-medium">Automatic follow-up emails</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
              Sends up to {settings.max_followups} follow-ups after an enquiry, then stops. Stops early if
              the lead replies (status becomes interested / meeting booked / closed) or unsubscribes.
            </p>
          </div>
        </div>
        <Switch data-testid="followup-toggle" checked={!!settings.enabled} disabled={saving} onCheckedChange={toggle} />
      </div>

      <Badge className={`rounded-full border-0 ${settings.enabled ? "bg-neutral-900 text-white dark:bg-white dark:text-black" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>
        {settings.enabled ? "Follow-up emails are ON" : "Follow-up emails are OFF"}
      </Badge>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <Row label="Schedule after enquiry" value={schedule || "—"} />
        <Row label="Max per lead" value={`${settings.max_followups} emails`} />
        <Row label="Sweep runs every" value={`${settings.interval_minutes} min`} icon={Clock} />
        <Row label="Sending window" value={`${q.start}–${q.end} ${q.timezone || ""}`} icon={Clock} />
      </div>

      {!settings.email_configured && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Email not configured — set RESEND_API_KEY and FOLLOWUP_FROM_EMAIL in backend/.env.
        </p>
      )}

      <AIEmailToggle />

      {settings.from_email && <p className="text-xs text-neutral-400">Sending from {settings.from_email}</p>}
      <p className="text-xs text-neutral-400">Every email includes an unsubscribe link. When AI is off, the three templates in backend/followup.py are used.</p>
    </div>
  );
}

// AI-written follow-ups toggle — reads/writes GET|PUT /api/settings/ai-emails.
// When on, follow-ups are generated to answer each lead's enquiry from the
// Knowledge Base; otherwise the static templates are used.
function AIEmailToggle() {
  const [settings, setSettings] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setState("loading");
    try { setSettings(await aiEmailsApi.getSettings()); setState("ready"); }
    catch { setState("error"); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (enabled) => {
    setSaving(true);
    try {
      setSettings(await aiEmailsApi.setSettings(enabled));
      toast.success(enabled ? "AI follow-ups enabled" : "AI follow-ups disabled",
        { description: enabled ? "Emails will answer enquiries from your Knowledge Base." : "Reverting to templates." });
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (state !== "ready") return null; // stay quiet if the endpoint isn't reachable

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-white/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-neutral-400 mt-0.5" />
          <div>
            <p className="font-medium">AI-written follow-ups</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
              Writes each email with AI, grounded only in your{" "}
              <a href="/app/knowledge" className="underline underline-offset-2">Knowledge Base</a>.
              When off (default), follow-ups use rule-based keyword matching from your Knowledge Base instead.
            </p>
          </div>
        </div>
        <Switch data-testid="ai-emails-toggle" checked={!!settings.enabled}
          disabled={saving || !settings.api_configured} onCheckedChange={toggle} />
      </div>
      {!settings.api_configured && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> AI not configured — set ANTHROPIC_API_KEY in backend/.env.
        </p>
      )}
      {settings.api_configured && (
        <Badge className={`rounded-full border-0 ${settings.active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>
          {settings.active ? `AI is ON · ${settings.model}` : "AI is OFF — using templates"}
        </Badge>
      )}
    </div>
  );
}

function Row({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-white/10 px-3 py-2">
      <p className="text-xs text-neutral-500 flex items-center gap-1">{Icon && <Icon className="w-3 h-3" />}{label}</p>
      <p className="font-medium mt-0.5">{value}</p>
    </div>
  );
}
