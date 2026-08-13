import { useMemo, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Chrome, Building2, Slack, Magnet, Cloud, GitBranch, Circle, Phone,
  Sparkles, Brain, Linkedin, Webhook, Check, RefreshCw, ExternalLink,
  ShieldCheck, KeyRound, Link2, Loader2, Database
} from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { integrations as defaults } from "@/lib/mockData";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { oauthApi, backendConfigured, PLATFORM_BY_NAME } from "@/lib/api";
import ProviderConnections from "@/components/app/ProviderConnections";
import { toast } from "sonner";

const iconMap = { Chrome, Building2, Slack, Magnet, Cloud, GitBranch, Circle, Phone, Sparkles, Brain, Linkedin, Webhook, Database };
const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");

export default function Integrations() {
  // Persisted overrides: { [name]: { connected, detail } }. Merged onto defaults
  // so newly-added integrations still appear, while user changes survive reloads.
  const [overrides, setOverrides] = useLocalStorage("leadpilot.integrations", {});
  const [dialogFor, setDialogFor] = useState(null); // integration object being connected

  // Real backend connection state. `ready` is false until the backend answers,
  // at which point configured OAuth providers switch to the real flow.
  const [backend, setBackend] = useState({ ready: false, available: [], connected: [] });

  const refreshBackend = useCallback(async () => {
    const data = await oauthApi.listConnections();
    if (data) {
      setBackend({
        ready: true,
        available: data.available || [],
        connected: (data.connected || []).map((c) => c.platform),
      });
    } else {
      setBackend((b) => ({ ...b, ready: false }));
    }
  }, []);

  useEffect(() => { if (backendConfigured()) refreshBackend(); }, [refreshBackend]);

  // Handle the OAuth callback return: /app/integrations?connected=… or ?error=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const connected = p.get("connected");
    const error = p.get("error");
    if (connected) toast.success(`${connected} connected`, { description: "Authorization complete." });
    if (error) toast.error("Connection failed", { description: error });
    if (connected || error) {
      window.history.replaceState({}, "", window.location.pathname);
      refreshBackend();
    }
  }, [refreshBackend]);

  const items = useMemo(
    () => defaults.map((d) => {
      const real = d.type === "oauth" && backend.ready && backend.available.includes(PLATFORM_BY_NAME[d.name]);
      const connected = real
        ? backend.connected.includes(PLATFORM_BY_NAME[d.name])
        : (overrides[d.name]?.connected ?? d.connected);
      return { ...d, ...(overrides[d.name] || {}), connected, _real: real };
    }),
    [overrides, backend]
  );
  const connectedCount = items.filter((i) => i.connected).length;

  const setConnection = (name, connected, detail) =>
    setOverrides((o) => ({ ...o, [name]: { connected, ...(detail ? { detail } : {}) } }));

  // ── Connect / disconnect: route to the real backend or the demo flow ──
  const handleConnect = async (it) => {
    if (it._real) {
      try {
        await oauthApi.startAuthorize(PLATFORM_BY_NAME[it.name]); // full-page redirect to provider
      } catch (e) {
        toast.error("Couldn't start authorization", { description: e.message });
      }
    } else {
      setDialogFor(it); // client-side demo consent
    }
  };

  const handleDisconnect = async (it) => {
    if (it._real) {
      try {
        await oauthApi.disconnect(PLATFORM_BY_NAME[it.name]);
        toast.success(`${it.name} disconnected`);
        refreshBackend();
      } catch {
        toast.error(`Couldn't disconnect ${it.name}`);
      }
    } else {
      disconnect(it.name);
    }
  };

  const disconnect = (name) => {
    setConnection(name, false);
    toast.success(`${name} disconnected`);
  };

  const completeConnect = (name, detail) => {
    setConnection(name, true, detail);
    setDialogFor(null);
    toast.success(`${name} connected`, { description: "Your account is now linked." });
  };

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle={`${connectedCount} of ${items.length} tools connected`}
        testid="integrations-header"
        action={
          <Button data-testid="sync-btn" variant="outline" className="rounded-full"
            onClick={() => toast.success("All integrations synced")}>
            <RefreshCw className="w-4 h-4 mr-1" /> Sync all
          </Button>
        }
      />

      {/* Real, per-org provider accounts (Bland calling + Resend email) — bring
          your own encrypted API keys. The grid below stays a demo showcase. */}
      <ProviderConnections />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((it, i) => {
          const Icon = iconMap[it.icon] || Circle;
          return (
            <motion.div key={it.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i % 6) * 0.05 }}
              className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 flex flex-col" data-testid={`integration-${slug(it.name)}`}>
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center"><Icon className="w-5 h-5 text-neutral-600 dark:text-neutral-300" /></div>
                {it.connected && <Badge className="rounded-full border-0 bg-neutral-900 text-white dark:bg-white dark:text-black"><Check className="w-3 h-3 mr-1" /> Connected</Badge>}
              </div>
              <h3 className="font-heading font-semibold mt-4">{it.name}</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 flex-1">{it.desc}</p>
              {it.connected && it.detail && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2 truncate">Linked: {it.detail}</p>
              )}
              {it.connected ? (
                <Button data-testid={`integration-toggle-${slug(it.name)}`} onClick={() => handleDisconnect(it)}
                  variant="outline" className="mt-4 w-full rounded-full">
                  Disconnect
                </Button>
              ) : (
                <Button data-testid={`integration-toggle-${slug(it.name)}`} onClick={() => handleConnect(it)}
                  className="mt-4 w-full rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                  <Link2 className="w-4 h-4 mr-1.5" /> Connect
                </Button>
              )}
            </motion.div>
          );
        })}
      </div>

      <ConnectDialog integration={dialogFor} onClose={() => setDialogFor(null)} onConnect={completeConnect} />
    </div>
  );
}

function ConnectDialog({ integration, onClose, onConnect }) {
  const open = !!integration;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="connect-dialog">
        {integration && <ConnectBody key={integration.name} integration={integration} onConnect={onConnect} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ConnectBody({ integration, onConnect, onClose }) {
  const Icon = iconMap[integration.icon] || Circle;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = (detail) => {
    setBusy(true);
    // Simulate the token/handshake round-trip so the flow feels real.
    setTimeout(() => { setBusy(false); onConnect(integration.name, detail); }, 800);
  };

  const isValidUrl = (u) => /^https?:\/\/.+/i.test(u.trim());

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
          </div>
          <div>
            <DialogTitle className="font-heading">Connect {integration.name}</DialogTitle>
            <DialogDescription className="text-xs">{integration.desc}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {/* OAuth flow — provider consent screen */}
      {integration.type === "oauth" && (
        <div className="space-y-4 py-2" data-testid="consent-screen">
          <div className="rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden">
            <div className="bg-neutral-900 dark:bg-neutral-950 text-white px-4 py-3 flex items-center gap-2 text-sm">
              <Icon className="w-4 h-4" /> Sign in to {integration.name}
            </div>
            <div className="p-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-200">
                <span className="font-semibold">LeadPilot AI</span> wants permission to access your {integration.name} account:
              </p>
              <ul className="mt-3 space-y-2">
                {integration.scopes.split(",").map((s) => (
                  <li key={s} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                    <span className="w-5 h-5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-black flex items-center justify-center shrink-0"><Check className="w-3 h-3" /></span>
                    Read &amp; write your <span className="font-medium">{s.trim()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex gap-3">
            <Button data-testid="connect-deny" variant="outline" onClick={() => onClose && onClose()} disabled={busy}
              className="flex-1 rounded-full h-11">
              Deny
            </Button>
            <Button data-testid="connect-finish" onClick={() => finish()} disabled={busy}
              className="flex-[2] rounded-full h-11 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {integration.category === "crm" ? "Importing your data…" : "Connecting…"}</> : `Allow access`}
            </Button>
          </div>
          <p className="text-xs text-neutral-400 text-center">You can revoke access anytime from Integrations.</p>
        </div>
      )}

      {/* API key flow */}
      {integration.type === "apikey" && (
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> {integration.keyLabel}</Label>
              <a href={integration.authUrl} target="_blank" rel="noopener noreferrer" data-testid="connect-get-key"
                className="text-xs text-neutral-500 hover:underline inline-flex items-center gap-1">Get your key <ExternalLink className="w-3 h-3" /></a>
            </div>
            <Input data-testid="connect-key-input" value={value} onChange={(e) => setValue(e.target.value)}
              type="password" placeholder={integration.keyHint} className="rounded-xl h-11 font-mono" autoFocus />
            <p className="text-xs text-neutral-400">{integration.keyHint} — stored locally in your browser.</p>
          </div>
          <Button data-testid="connect-finish" onClick={() => finish(`••••${value.slice(-4)}`)} disabled={value.trim().length < 6 || busy}
            className="w-full rounded-full h-11 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</> : "Connect"}
          </Button>
        </div>
      )}

      {/* Webhook flow */}
      {integration.type === "webhook" && (
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5"><Webhook className="w-3.5 h-3.5" /> {integration.keyLabel}</Label>
              <a href={integration.authUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-neutral-500 hover:underline inline-flex items-center gap-1">Need a test URL? <ExternalLink className="w-3 h-3" /></a>
            </div>
            <Input data-testid="connect-key-input" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="https://your-app.com/webhooks/leadpilot" className="rounded-xl h-11 font-mono text-sm" autoFocus />
            <p className="text-xs text-neutral-400">{integration.keyHint}</p>
          </div>
          <Button data-testid="connect-finish" onClick={() => finish(value.trim())} disabled={!isValidUrl(value) || busy}
            className="w-full rounded-full h-11 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending test event…</> : "Send test & connect"}
          </Button>
          {value && !isValidUrl(value) && <p className="text-xs text-neutral-400 text-center">Enter a valid http(s) URL.</p>}
        </div>
      )}

      <DialogFooter className="sm:justify-center">
        <p className="text-xs text-neutral-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Encrypted in transit · revoke anytime</p>
      </DialogFooter>
    </>
  );
}
