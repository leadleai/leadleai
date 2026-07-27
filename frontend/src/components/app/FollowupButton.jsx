import { useEffect, useState } from "react";
import { Mail, Loader2, AlertTriangle, Send, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { emailsApi } from "@/lib/backend";
import { toast } from "sonner";

// Opens a compose window pre-filled from the next-due template. Everything is
// editable; sending goes to POST /api/emails/send (which logs it, advances the
// step, and enforces the same guardrails as the automatic drip).
export default function FollowupButton({ lead, onSent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full"
        data-testid={`followup-btn-${lead.id}`} onClick={() => setOpen(true)}>
        <Mail className="w-3.5 h-3.5 mr-1" /> Send follow-up
      </Button>
      <ComposeDialog lead={lead} open={open} onOpenChange={setOpen} onSent={onSent} />
    </>
  );
}

function ComposeDialog({ lead, open, onOpenChange, onSent }) {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);      // { to, subject, body, step, max, blocked }
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState("loading"); setError(null);
    emailsApi.compose(lead.id)
      .then((d) => alive && (setDraft(d), setState("ready")))
      .catch((e) => alive && (setError(e.message), setState("error")));
    return () => { alive = false; };
  }, [open, lead.id]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const send = async () => {
    setSending(true);
    try {
      const r = await emailsApi.send({
        lead_id: lead.id, to: draft.to, subject: draft.subject, body: draft.body,
      });
      toast.success(`Follow-up ${r.step}/${r.max} sent`, { description: `Emailed ${draft.to}` });
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast.error("Email not sent", { description: e.message });
    } finally {
      setSending(false);
    }
  };

  const canSend = state === "ready" && !draft?.blocked && !sending
    && draft?.to?.trim() && draft?.subject?.trim() && draft?.body?.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="compose-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-heading truncate">Follow-up to {lead.name}</DialogTitle>
              <DialogDescription className="text-xs">
                Edit anything before sending — this replaces the template for this send only.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {state === "loading" && (
          <div className="py-12 flex items-center justify-center gap-2 text-sm text-neutral-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading draft…
          </div>
        )}

        {state === "error" && (
          <div className="rounded-xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
              <AlertTriangle className="w-4 h-4" /> Couldn’t load the draft
            </div>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        )}

        {state === "ready" && draft && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                Follow-up {draft.step}/{draft.max}
              </Badge>
              {draft.ai_used && (
                <Badge data-testid="compose-ai-badge"
                  className="rounded-full border-0 bg-neutral-900 text-white dark:bg-white dark:text-black">
                  <Sparkles className="w-3 h-3 mr-1" /> AI draft
                </Badge>
              )}
              {!draft.ai_used && draft.kb_matched && (
                <Badge data-testid="compose-kb-badge"
                  className="rounded-full border border-neutral-300 dark:border-white/25 bg-transparent text-neutral-700 dark:text-neutral-200">
                  <Target className="w-3 h-3 mr-1" /> Matched: {draft.kb_matched}
                </Badge>
              )}
              {draft.blocked && (
                <Badge className="rounded-full border border-neutral-400 dark:border-white/30 bg-transparent text-neutral-600 dark:text-neutral-300">
                  Blocked
                </Badge>
              )}
            </div>

            {draft.blocked && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {draft.blocked}
              </p>
            )}

            <div className="space-y-1.5">
              <Label>To</Label>
              <Input data-testid="compose-to" value={draft.to} onChange={(e) => set("to", e.target.value)}
                className="rounded-xl" placeholder="name@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input data-testid="compose-subject" value={draft.subject} onChange={(e) => set("subject", e.target.value)}
                className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Body <span className="text-neutral-400 font-normal">(HTML supported)</span></Label>
              <Textarea data-testid="compose-body" value={draft.body} onChange={(e) => set("body", e.target.value)}
                rows={12} className="rounded-xl font-mono text-xs leading-relaxed" />
              <p className="text-xs text-neutral-400">An unsubscribe link is appended automatically.</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-full" data-testid="compose-cancel"
            onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            data-testid="compose-send" onClick={send} disabled={!canSend}>
            {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : <><Send className="w-4 h-4 mr-2" /> Send</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
