import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Phone, Mail, KeyRound, Check, Loader2, ExternalLink, ShieldCheck, Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectionsApi } from "@/lib/backend";
import { backendConfigured } from "@/lib/api";
import { toast } from "sonner";

// The two API-key providers an org connects with THEIR OWN account, so their calls
// and emails are billed to them. Purely declarative — the card renders from this.
const PROVIDERS = [
  {
    service: "bland",
    name: "Bland",
    kind: "Calling",
    icon: Phone,
    keyLabel: "Bland API key",
    keyHint: "sk-…",
    needsFromEmail: false,
    getKeyUrl: "https://app.bland.ai/dashboard?page=api",
    guidance: "Enter your own Bland API key so outbound AI calls run on — and are billed to — your account.",
  },
  {
    service: "resend",
    name: "Resend",
    kind: "Email",
    icon: Mail,
    keyLabel: "Resend API key",
    keyHint: "re_…",
    needsFromEmail: true,
    getKeyUrl: "https://resend.com/api-keys",
    guidance: "Enter your own Resend API key and a verified from-address so follow-up emails send from your domain.",
  },
];

export default function ProviderConnections() {
  const [ready, setReady] = useState(false);
  // { [service]: { connected, masked_key, from_email, updated_at } }
  const [byService, setByService] = useState({});
  const [editing, setEditing] = useState(null); // service currently showing its form

  const refresh = useCallback(async () => {
    try {
      const rows = await connectionsApi.list();
      const map = {};
      (rows || []).forEach((r) => { map[r.service] = r; });
      setByService(map);
      setReady(true);
    } catch {
      // Not signed in / backend unreachable — hide the section rather than error.
      setReady(false);
    }
  }, []);

  useEffect(() => { if (backendConfigured()) refresh(); }, [refresh]);

  const handleDisconnect = async (service, name) => {
    try {
      await connectionsApi.remove(service);
      toast.success(`${name} disconnected`);
      setEditing((e) => (e === service ? null : e));
      refresh();
    } catch (err) {
      toast.error(`Couldn't disconnect ${name}`, { description: err.message });
    }
  };

  if (!backendConfigured() || !ready) return null;

  return (
    <div className="mb-10" data-testid="provider-connections">
      <div className="mb-4">
        <h2 className="font-heading font-semibold text-lg">Your provider accounts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Bring your own calling and email keys. They're encrypted at rest and only ever used
          server-side to place your calls and send your emails — never shown back in full.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {PROVIDERS.map((p, i) => {
          const conn = byService[p.service];
          const connected = !!conn?.connected;
          const open = editing === p.service;
          const Icon = p.icon;
          return (
            <motion.div
              key={p.service}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 flex flex-col"
              data-testid={`connection-${p.service}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold leading-tight">{p.name}</h3>
                    <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">{p.kind}</p>
                  </div>
                </div>
                {connected && (
                  <Badge className="rounded-full border-0 bg-neutral-900 text-white dark:bg-white dark:text-black">
                    <Check className="w-3 h-3 mr-1" /> Connected
                  </Badge>
                )}
              </div>

              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3 flex-1">{p.guidance}</p>

              {connected && (
                <div className="mt-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200 dark:border-white/10 px-3 py-2 text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300 font-mono">
                    <KeyRound className="w-3.5 h-3.5" /> {conn.masked_key || "key on file"}
                  </div>
                  {conn.from_email && (
                    <div className="text-muted-foreground mt-1">From: {conn.from_email}</div>
                  )}
                </div>
              )}

              {open ? (
                <ConnectForm
                  provider={p}
                  onCancel={() => setEditing(null)}
                  onSaved={() => { setEditing(null); refresh(); }}
                />
              ) : (
                <div className="mt-4 flex gap-2">
                  {connected ? (
                    <>
                      <Button
                        variant="outline" className="flex-1 rounded-full"
                        onClick={() => setEditing(p.service)}
                        data-testid={`connection-update-${p.service}`}
                      >
                        <Pencil className="w-4 h-4 mr-1.5" /> Update key
                      </Button>
                      <Button
                        variant="outline" className="rounded-full"
                        onClick={() => handleDisconnect(p.service, p.name)}
                        data-testid={`connection-disconnect-${p.service}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="w-full rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      onClick={() => setEditing(p.service)}
                      data-testid={`connection-connect-${p.service}`}
                    >
                      <KeyRound className="w-4 h-4 mr-1.5" /> Connect {p.name}
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-4">
        <ShieldCheck className="w-3.5 h-3.5" /> Keys are encrypted at rest and never returned to your browser.
      </p>
    </div>
  );
}

function ConnectForm({ provider, onCancel, onSaved }) {
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const emailOk = !provider.needsFromEmail || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail.trim());
  const canSave = apiKey.trim().length >= 6 && emailOk && !busy;

  const save = async () => {
    setBusy(true);
    try {
      await connectionsApi.save({
        service: provider.service,
        api_key: apiKey.trim(),
        from_email: provider.needsFromEmail ? fromEmail.trim() : undefined,
      });
      toast.success(`${provider.name} connected`, { description: "Your key is stored securely." });
      onSaved();
    } catch (err) {
      toast.error(`Couldn't save ${provider.name}`, { description: err.message });
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-3" data-testid={`connection-form-${provider.service}`}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-xs"><KeyRound className="w-3.5 h-3.5" /> {provider.keyLabel}</Label>
          <a href={provider.getKeyUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-neutral-500 hover:underline inline-flex items-center gap-1">
            Get your key <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <Input
          type="password" autoFocus value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider.keyHint} className="rounded-xl h-11 font-mono"
          data-testid={`connection-key-input-${provider.service}`}
        />
      </div>

      {provider.needsFromEmail && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs"><Mail className="w-3.5 h-3.5" /> From email (verified sender)</Label>
          <Input
            type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)}
            placeholder="hello@yourdomain.com" className="rounded-xl h-11"
            data-testid={`connection-from-input-${provider.service}`}
          />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1 rounded-full" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          className="flex-[2] rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          onClick={save} disabled={!canSave}
          data-testid={`connection-save-${provider.service}`}
        >
          {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save key"}
        </Button>
      </div>
    </div>
  );
}
