import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthShell from "./AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

/**
 * Landing page for the emailed reset link.
 *
 * Supabase turns the link's token into a real session automatically
 * (detectSessionInUrl), so by the time this renders the user is transiently
 * signed in and updateUser({password}) is allowed. No session => the link was
 * bad or already used.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword, session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [waited, setWaited] = useState(false);

  // Give Supabase a beat to exchange the URL token before we call the link bad.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError("Must be at least 8 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setError("");
    setSaving(true);
    try {
      await updatePassword(password);
      toast.success("Password updated — you're signed in.");
      navigate("/app", { replace: true });
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const linkInvalid = !loading && waited && !session;

  return (
    <AuthShell title="Choose a new password" subtitle="Enter a new password for your account.">
      {linkInvalid ? (
        <div className="space-y-6" data-testid="reset-invalid">
          <p className="text-sm text-red-400">
            This reset link is invalid or has expired. Request a fresh one.
          </p>
          <Link to="/forgot-password">
            <Button variant="outline" className="w-full h-11 rounded-full">Send a new link</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="reset-form" noValidate>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input data-testid="reset-password" type="password" value={password} autoComplete="new-password"
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="At least 8 characters" className="rounded-xl h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm password</Label>
            <Input data-testid="reset-confirm" type="password" value={confirm} autoComplete="new-password"
              onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              placeholder="Repeat it" className="rounded-xl h-11" />
          </div>
          {error && <p className="text-sm text-red-500" data-testid="reset-error">{error}</p>}
          <Button data-testid="reset-submit" type="submit" disabled={saving}
            className="w-full h-11 rounded-full bg-white text-black hover:shadow-lg">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Update password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
