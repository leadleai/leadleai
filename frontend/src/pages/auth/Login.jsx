import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthShell, { GoogleButton, ConfigWarning } from "./AuthShell";
import OtpForm from "./OtpForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, configured } = useAuth();
  const [method, setMethod] = useState("password"); // "password" | "otp"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // Send people back where they were headed before the redirect to /login,
  // preserving any query string (e.g. an invite token on /accept-invite).
  const fromLoc = location.state?.from;
  const from = fromLoc ? `${fromLoc.pathname}${fromLoc.search || ""}` : "/app";

  const submit = async (e) => {
    e.preventDefault();
    const err = {};
    if (!email.trim()) err.email = "Email is required";
    else if (!emailRe.test(email)) err.email = "Enter a valid email address";
    if (!password) err.password = "Password is required";
    setErrors(err);
    if (Object.keys(err).length) return;

    setLoading(true);
    try {
      await signIn(email.trim(), password);
      toast.success("Welcome back!");
      navigate(from, { replace: true });
    } catch (e2) {
      setErrors({ form: e2.message });
    } finally {
      setLoading(false);
    }
  };

  if (method === "otp") {
    return (
      <AuthShell title="Welcome back" subtitle="We'll email you a one-time code — no password needed">
        <ConfigWarning configured={configured} />
        <OtpForm testidPrefix="login-otp" createUser={false}
          onVerified={() => { toast.success("Welcome back!"); navigate(from, { replace: true }); }} />

        <div className="relative py-2 mt-4">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-neutral-200 dark:border-neutral-800" /></div>
          <span className="relative mx-auto block w-fit bg-white dark:bg-neutral-950 px-3 text-xs text-neutral-400">OR</span>
        </div>

        <Button type="button" variant="outline" data-testid="login-use-password"
          onClick={() => setMethod("password")} className="w-full h-11 rounded-full">
          Use password instead
        </Button>

        <p className="text-center text-sm text-neutral-500 mt-4">
          Don&apos;t have an account?{" "}
          <Link to="/signup" data-testid="to-signup" className="text-neutral-300 font-medium hover:underline">Sign up</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your LeadPilot workspace">
      <ConfigWarning configured={configured} />
      <form onSubmit={submit} className="space-y-4" data-testid="login-form" noValidate>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input data-testid="login-email" type="email" value={email} autoComplete="email"
            onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined, form: undefined })); }}
            placeholder="you@company.com" className="rounded-xl h-11" />
          {errors.email && <p className="text-xs text-red-500" data-testid="login-email-error">{errors.email}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Password</Label>
            <Link to="/forgot-password" data-testid="forgot-link" className="text-xs text-neutral-400 hover:underline">Forgot password?</Link>
          </div>
          <Input data-testid="login-password" type="password" value={password} autoComplete="current-password"
            onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined, form: undefined })); }}
            placeholder="••••••••" className="rounded-xl h-11" />
          {errors.password && <p className="text-xs text-red-500" data-testid="login-password-error">{errors.password}</p>}
        </div>

        {errors.form && (
          <p className="text-sm text-red-500" data-testid="login-error">{errors.form}</p>
        )}

        <Button data-testid="login-submit" type="submit" disabled={loading || !configured}
          className="w-full h-11 rounded-full bg-white text-black hover:shadow-lg">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Logging in…</> : "Log in"}
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-neutral-200 dark:border-neutral-800" /></div>
          <span className="relative mx-auto block w-fit bg-white dark:bg-neutral-950 px-3 text-xs text-neutral-400">OR CONTINUE WITH</span>
        </div>

        <GoogleButton testid="login-google" />

        <Button type="button" variant="outline" data-testid="login-use-otp"
          onClick={() => setMethod("otp")} className="w-full h-11 rounded-xl">
          Email me a code
        </Button>

        <p className="text-center text-sm text-neutral-500 mt-4">
          Don&apos;t have an account?{" "}
          <Link to="/signup" data-testid="to-signup" className="text-neutral-300 font-medium hover:underline">Sign up</Link>
        </p>
      </form>
    </AuthShell>
  );
}
