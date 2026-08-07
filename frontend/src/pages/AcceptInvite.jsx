import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, Users } from "lucide-react";
import AuthShell from "@/pages/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { orgApi } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

/**
 * Redeem an invite link: /accept-invite?token=…
 *
 * Public route. If you're signed in, we redeem the token immediately and drop
 * you into the joined workspace. If you're not, we show who the invite is for
 * and route you to log in / sign up with that email — the DB trigger joins you
 * on signup, and this page finishes the token redemption when you return.
 */
export default function AcceptInvite() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const { session, loading: authLoading, user, switchOrg } = useAuth();

  const [preview, setPreview] = useState(null);   // {email, role, org_name, valid, expired}
  const [phase, setPhase] = useState("loading");  // loading | need-auth | joining | done | error
  const [error, setError] = useState(null);
  const [joinedOrg, setJoinedOrg] = useState(null);

  // Load a public preview so we can name the org/email even when logged out.
  useEffect(() => {
    let active = true;
    if (!token) { setPhase("error"); setError("This invite link is missing its token."); return; }
    orgApi.previewInvite(token)
      .then((p) => { if (active) setPreview(p); })
      .catch((e) => { if (active) { setPhase("error"); setError(e.message); } });
    return () => { active = false; };
  }, [token]);

  const accept = useCallback(async () => {
    setPhase("joining"); setError(null);
    try {
      const res = await orgApi.acceptInvite(token);
      setJoinedOrg(res.org);
      if (res.org?.id) await switchOrg(res.org.id);
      setPhase("done");
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  }, [token, switchOrg]);

  // Once we have a token, a preview, and a session, redeem automatically.
  useEffect(() => {
    if (authLoading || !token || !preview) return;
    if (!session) { setPhase("need-auth"); return; }
    if (phase === "loading" || phase === "need-auth") accept();
  }, [authLoading, token, preview, session, phase, accept]);

  const authState = { from: { pathname: "/accept-invite", search: location.search } };

  // ── Rendered states ─────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <AuthShell title="Invite problem" subtitle="We couldn't accept this invitation.">
        <div className="space-y-6" data-testid="accept-error">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-center text-sm text-neutral-400">{error}</p>
          <Link to={session ? "/app" : "/login"}>
            <Button variant="outline" className="w-full h-11 rounded-full">
              {session ? "Go to your workspace" : "Back to login"}
            </Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell title="You're in!" subtitle={`Welcome to ${joinedOrg?.name || "the team"}.`}>
        <div className="space-y-6" data-testid="accept-done">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <p className="text-center text-sm text-neutral-400">
            You've joined <span className="text-neutral-200">{joinedOrg?.name || "the workspace"}</span> as {preview?.role || "member"}.
          </p>
          <Button className="w-full h-11 rounded-full bg-white text-black hover:shadow-lg"
            data-testid="accept-continue" onClick={() => navigate("/app", { replace: true })}>
            Go to workspace
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (phase === "need-auth") {
    const expired = preview?.expired;
    const invalid = preview && !preview.valid;
    return (
      <AuthShell
        title={preview?.org_name ? `Join ${preview.org_name}` : "You've been invited"}
        subtitle={invalid ? "This invitation is no longer active." : "Sign in to accept your invitation."}>
        <div className="space-y-6" data-testid="accept-need-auth">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-500/10 mx-auto">
            <Users className="w-8 h-8 text-neutral-400" />
          </div>
          {invalid ? (
            <>
              <p className="text-center text-sm text-neutral-400">
                {expired ? "This invite has expired." : "This invite has already been used or revoked."} Ask an
                owner of {preview?.org_name || "the workspace"} to send you a new one.
              </p>
              <Link to="/login"><Button variant="outline" className="w-full h-11 rounded-full">Back to login</Button></Link>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-neutral-400">
                You were invited as <span className="text-neutral-200">{preview?.role || "member"}</span>
                {preview?.email ? <> using <span className="text-neutral-200">{preview.email}</span></> : null}.
                Sign in with that email to accept.
              </p>
              <div className="space-y-3">
                <Link to="/login" state={authState} className="block">
                  <Button className="w-full h-11 rounded-full bg-white text-black hover:shadow-lg" data-testid="accept-login">
                    Log in to accept
                  </Button>
                </Link>
                <Link to="/signup" state={authState} className="block">
                  <Button variant="outline" className="w-full h-11 rounded-full" data-testid="accept-signup">
                    Create an account
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </AuthShell>
    );
  }

  // loading / joining
  return (
    <AuthShell title="Accepting invite…" subtitle="One moment while we add you to the team.">
      <div className="flex items-center justify-center gap-2 text-sm text-neutral-400 py-8" data-testid="accept-loading">
        <Loader2 className="w-5 h-5 animate-spin" />
        {phase === "joining" ? `Joining ${preview?.org_name || "the workspace"}…` : "Checking your invite…"}
      </div>
    </AuthShell>
  );
}
