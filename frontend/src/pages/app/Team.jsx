import { useCallback, useEffect, useState } from "react";
import {
  Loader2, AlertTriangle, UserPlus, Trash2, Crown, User as UserIcon, MailCheck, Link2, Copy,
} from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { orgApi } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export default function Team() {
  const { org, isOwner } = useAuth();
  const [data, setData] = useState({ members: [], invites: [], can_manage: false });
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      setData(await orgApi.members());
      setState("ready");
    } catch (e) {
      setError(e.message); setState("error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const invite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    try {
      const res = await orgApi.invite(email.trim());
      toast.success(
        res.pending ? "Invite recorded" : "Member added",
        {
          description: res.pending
            ? `${res.email} will join this workspace when they sign up.`
            : `${res.email} now has access.`,
        }
      );
      setEmail("");
      load();
    } catch (e2) {
      toast.error("Couldn't invite", { description: e2.message });
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async (m) => {
    try {
      await orgApi.removeMember(m.id);
      toast.success(`Removed ${m.email || "member"}`);
      load();
    } catch (e) {
      toast.error("Couldn't remove", { description: e.message });
    }
  };

  const revoke = async (inv) => {
    try {
      await orgApi.revokeInvite(inv.id);
      toast.success(`Invite to ${inv.email} revoked`);
      load();
    } catch (e) {
      toast.error("Couldn't revoke", { description: e.message });
    }
  };

  const formUrl = org?.slug ? `${window.location.origin}/enquiry/${org.slug}` : null;

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={org?.name ? `Members of ${org.name}` : "Members of your workspace"}
        testid="team-header"
      />

      {/* Public enquiry form for this org */}
      {formUrl && (
        <div className="mb-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5"
          data-testid="team-form-url">
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="w-4 h-4 text-neutral-500" />
            <h4 className="font-heading font-semibold text-sm">Your public enquiry form</h4>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            Anyone can submit this form without logging in — leads land in this workspace.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={formUrl} className="rounded-xl font-mono text-xs" data-testid="team-form-url-input" />
            <Button variant="outline" className="rounded-xl shrink-0"
              onClick={() => { navigator.clipboard?.writeText(formUrl); toast.success("Copied"); }}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Invite */}
      {isOwner && (
        <form onSubmit={invite} data-testid="team-invite-form"
          className="mb-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5">
          <h4 className="font-heading font-semibold text-sm mb-1">Invite a teammate</h4>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            If they already have an account they're added right away; otherwise they join this
            workspace automatically when they sign up.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="sr-only">Email</Label>
              <Input data-testid="team-invite-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com" className="rounded-xl" />
            </div>
            <Button data-testid="team-invite-submit" type="submit" disabled={inviting}
              className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shrink-0">
              {inviting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Inviting…</>
                        : <><UserPlus className="w-4 h-4 mr-2" /> Invite</>}
            </Button>
          </div>
        </form>
      )}

      {state === "loading" && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-16 flex items-center justify-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading team…
        </div>
      )}

      {state === "error" && (
        <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm" data-testid="team-error">
          <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
            <AlertTriangle className="w-4 h-4" /> Couldn't load your team
          </div>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
        </div>
      )}

      {state === "ready" && (
        <>
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden divide-y divide-neutral-100 dark:divide-white/10"
            data-testid="team-members">
            {data.members.map((m) => (
              <div key={m.id} className="p-4 flex items-center gap-3" data-testid={`team-member-${m.id}`}>
                <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                  {m.role === "owner" ? <Crown className="w-4 h-4 text-neutral-500" />
                                      : <UserIcon className="w-4 h-4 text-neutral-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {m.email || <span className="text-neutral-400 font-mono text-xs">{m.user_id}</span>}
                    </span>
                    {m.is_you && (
                      <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">You</Badge>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 capitalize mt-0.5">{m.role}</p>
                </div>
                {data.can_manage && !m.is_you && (
                  <Button size="icon" variant="ghost" className="rounded-lg shrink-0"
                    data-testid={`team-remove-${m.id}`} onClick={() => removeMember(m)}
                    aria-label={`Remove ${m.email || "member"}`}>
                    <Trash2 className="w-4 h-4 text-neutral-400" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {data.invites.length > 0 && (
            <div className="mt-6">
              <h4 className="font-heading font-semibold text-sm mb-2 flex items-center gap-2">
                <MailCheck className="w-4 h-4 text-neutral-500" /> Pending invites
              </h4>
              <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden divide-y divide-neutral-100 dark:divide-white/10"
                data-testid="team-invites">
                {data.invites.map((inv) => (
                  <div key={inv.id} className="p-4 flex items-center gap-3" data-testid={`team-invite-${inv.id}`}>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm truncate">{inv.email}</span>
                      <p className="text-xs text-neutral-400 capitalize mt-0.5">
                        {inv.role} · awaiting signup
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="rounded-lg shrink-0"
                      onClick={() => revoke(inv)} aria-label={`Revoke invite to ${inv.email}`}>
                      <Trash2 className="w-4 h-4 text-neutral-400" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
