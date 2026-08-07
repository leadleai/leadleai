import { useCallback, useEffect, useState } from "react";
import {
  Loader2, AlertTriangle, UserPlus, Trash2, Crown, User as UserIcon, MailCheck,
  Link2, Copy, ShieldCheck, MoreVertical,
} from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { orgApi } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const roleLabel = (r) => (r === "owner" ? "Owner" : "Member");

function joinedLabel(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return null;
  }
}

export default function Team() {
  const { org, isOwner, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [yourRole, setYourRole] = useState("member");
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [busyUser, setBusyUser] = useState(null);   // user_id being mutated
  const [confirmRemove, setConfirmRemove] = useState(null); // member pending removal

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      const data = await orgApi.members();
      setMembers(data.members || []);
      setCanManage(!!data.can_manage);
      setYourRole(data.your_role || "member");
      // Pending invites are owner-only on the backend; skip the call otherwise.
      if (data.can_manage) {
        try { setInvites(await orgApi.invites()); }
        catch { setInvites([]); }
      } else {
        setInvites([]);
      }
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
      const res = await orgApi.invite(email.trim(), inviteRole);
      toast.success(
        res.pending ? "Invite sent" : "Member added",
        {
          description: res.pending
            ? `${res.email} can join by signing up with this email, or via their invite link.`
            : `${res.email} now has access as ${roleLabel(res.role)}.`,
        }
      );
      setEmail("");
      setInviteRole("member");
      load();
    } catch (e2) {
      toast.error("Couldn't invite", { description: e2.message });
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (m, role) => {
    if (role === m.role) return;
    setBusyUser(m.user_id);
    try {
      await orgApi.changeRole(m.user_id, role);
      toast.success(`${m.name || m.email || "Member"} is now ${roleLabel(role)}`);
      load();
    } catch (e) {
      toast.error("Couldn't change role", { description: e.message });
    } finally {
      setBusyUser(null);
    }
  };

  const doRemove = async (m) => {
    setConfirmRemove(null);
    setBusyUser(m.user_id);
    try {
      await orgApi.removeMember(m.user_id);
      toast.success(`Removed ${m.name || m.email || "member"}`);
      load();
    } catch (e) {
      toast.error("Couldn't remove", { description: e.message });
    } finally {
      setBusyUser(null);
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

  const copyInviteLink = (inv) => {
    const url = `${window.location.origin}/accept-invite?token=${encodeURIComponent(inv.token)}`;
    navigator.clipboard?.writeText(url);
    toast.success("Invite link copied", { description: url });
  };

  const ownerCount = members.filter((m) => m.role === "owner").length;
  const formUrl = org?.slug ? `${window.location.origin}/enquiry/${org.slug}` : null;

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={org?.name ? `Members of ${org.name}` : "Members of your workspace"}
        testid="team-header"
      />

      {/* Your own role */}
      <div className="mb-6 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"
        data-testid="team-your-role">
        <ShieldCheck className="w-4 h-4" />
        You're signed in as <span className="font-medium text-neutral-900 dark:text-white">{user?.email}</span>
        <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 capitalize">
          {roleLabel(yourRole)}
        </Badge>
      </div>

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
            workspace when they sign up with this email or open their invite link.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="sr-only">Email</Label>
              <Input data-testid="team-invite-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com" className="rounded-xl" />
            </div>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger data-testid="team-invite-role" className="rounded-xl sm:w-36 shrink-0">
                <SelectValue>{roleLabel(inviteRole)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
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
            {members.map((m) => {
              const joined = joinedLabel(m.created_at);
              // The sole owner can't be demoted or removed — mirror the backend guard in the UI.
              const isLastOwner = m.role === "owner" && ownerCount <= 1;
              const showControls = canManage && !m.is_you;
              return (
                <div key={m.id} className="p-4 flex items-center gap-3" data-testid={`team-member-${m.user_id}`}>
                  <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    {m.role === "owner" ? <Crown className="w-4 h-4 text-neutral-500" />
                                        : <UserIcon className="w-4 h-4 text-neutral-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {m.name || m.email || <span className="text-neutral-400 font-mono text-xs">{m.user_id}</span>}
                      </span>
                      {m.is_you && (
                        <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">You</Badge>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {m.name && m.email ? <span className="truncate">{m.email} · </span> : null}
                      <span className="capitalize">{roleLabel(m.role)}</span>
                      {joined ? ` · joined ${joined}` : ""}
                    </p>
                  </div>

                  {busyUser === m.user_id && <Loader2 className="w-4 h-4 animate-spin text-neutral-400 shrink-0" />}

                  {showControls && busyUser !== m.user_id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="rounded-lg shrink-0"
                          data-testid={`team-manage-${m.user_id}`} aria-label={`Manage ${m.email || "member"}`}>
                          <MoreVertical className="w-4 h-4 text-neutral-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {m.role === "member" ? (
                          <DropdownMenuItem onClick={() => changeRole(m, "owner")}>
                            <Crown className="w-4 h-4 mr-2" /> Make owner
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem disabled={isLastOwner} onClick={() => changeRole(m, "member")}>
                            <UserIcon className="w-4 h-4 mr-2" /> Change to member
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={isLastOwner}
                          className="text-red-600 focus:text-red-600"
                          onClick={() => setConfirmRemove(m)}
                          data-testid={`team-remove-${m.user_id}`}>
                          <Trash2 className="w-4 h-4 mr-2" /> Remove from team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>

          {canManage && invites.length > 0 && (
            <div className="mt-6">
              <h4 className="font-heading font-semibold text-sm mb-2 flex items-center gap-2">
                <MailCheck className="w-4 h-4 text-neutral-500" /> Pending invites
              </h4>
              <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden divide-y divide-neutral-100 dark:divide-white/10"
                data-testid="team-invites">
                {invites.map((inv) => (
                  <div key={inv.id} className="p-4 flex items-center gap-2" data-testid={`team-invite-${inv.id}`}>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm truncate">{inv.email}</span>
                      <p className="text-xs text-neutral-400 capitalize mt-0.5">
                        {roleLabel(inv.role)} · awaiting acceptance
                      </p>
                    </div>
                    {inv.token && (
                      <Button size="sm" variant="outline" className="rounded-full shrink-0 gap-1.5"
                        onClick={() => copyInviteLink(inv)} data-testid={`team-invite-copy-${inv.id}`}>
                        <Link2 className="w-3.5 h-3.5" /> Copy link
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="rounded-lg shrink-0"
                      onClick={() => revoke(inv)} aria-label={`Revoke invite to ${inv.email}`}
                      data-testid={`team-invite-revoke-${inv.id}`}>
                      <Trash2 className="w-4 h-4 text-neutral-400" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirm member removal */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove
                ? `${confirmRemove.name || confirmRemove.email || "This member"} will lose access to ${org?.name || "this workspace"}. This can't be undone, but you can invite them again later.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => doRemove(confirmRemove)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
