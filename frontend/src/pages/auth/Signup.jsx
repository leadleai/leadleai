import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, MailCheck } from "lucide-react";
import AuthShell, { GoogleButton, ConfigWarning } from "./AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const navigate = useNavigate();
  const { signUp, configured } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [terms, setTerms] = useState(true);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined, form: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const err = {};
    if (!form.email.trim()) err.email = "Email is required";
    else if (!emailRe.test(form.email)) err.email = "Enter a valid email address";
    if (!form.password) err.password = "Password is required";
    else if (form.password.length < 8) err.password = "Must be at least 8 characters";
    if (!terms) err.terms = "You must accept the terms";
    setErrors(err);
    if (Object.keys(err).length) return;

    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(form.email.trim(), form.password);
      if (needsConfirmation) {
        setConfirmSent(true);
      } else {
        // Your workspace is created by a database trigger on signup.
        toast.success("Account created — welcome!");
        navigate("/app", { replace: true });
      }
    } catch (e2) {
      setErrors({ form: e2.message });
    } finally {
      setLoading(false);
    }
  };

  if (confirmSent) {
    return (
      <AuthShell title="Check your email" subtitle="Confirm your address to finish signing up.">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="space-y-6" data-testid="signup-confirm">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-500/10 mx-auto">
            <MailCheck className="w-8 h-8 text-neutral-400" />
          </div>
          <p className="text-center text-sm text-neutral-400">
            We sent a confirmation link to <span className="text-neutral-200">{form.email}</span>.
            Your workspace is ready as soon as you confirm.
          </p>
          <Link to="/login"><Button variant="outline" className="w-full h-11 rounded-full">Back to login</Button></Link>
        </motion.div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Start your free trial" subtitle="14 days free. No credit card required.">
      <ConfigWarning configured={configured} />
      <form onSubmit={submit} className="space-y-4" data-testid="signup-form" noValidate>
        <div className="space-y-1.5">
          <Label>Work email</Label>
          <Input data-testid="signup-email" type="email" value={form.email} autoComplete="email"
            onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" className="rounded-xl h-11" />
          {errors.email && <p className="text-xs text-red-500" data-testid="signup-email-error">{errors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input data-testid="signup-password" type="password" value={form.password} autoComplete="new-password"
            onChange={(e) => set("password", e.target.value)} placeholder="Create a password (min 8 chars)" className="rounded-xl h-11" />
          {errors.password && <p className="text-xs text-red-500" data-testid="signup-password-error">{errors.password}</p>}
        </div>
        <label className="flex items-start gap-2 text-sm text-neutral-400">
          <Checkbox data-testid="signup-terms" checked={terms}
            onCheckedChange={(v) => { setTerms(!!v); setErrors((e) => ({ ...e, terms: undefined })); }} className="mt-0.5" />
          I agree to the Terms of Service and Privacy Policy
        </label>
        {errors.terms && <p className="text-xs text-red-500 -mt-2">{errors.terms}</p>}

        {errors.form && <p className="text-sm text-red-500" data-testid="signup-error">{errors.form}</p>}

        <Button data-testid="signup-submit" type="submit" disabled={loading || !configured}
          className="w-full h-11 rounded-full bg-white text-black hover:shadow-lg">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account…</> : "Create account"}
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-neutral-200 dark:border-neutral-800" /></div>
          <span className="relative mx-auto block w-fit bg-white dark:bg-neutral-950 px-3 text-xs text-neutral-400">OR SIGN UP WITH</span>
        </div>

        <GoogleButton testid="signup-google" label="Sign up with Google" />

        <p className="text-center text-sm text-neutral-500 mt-4">
          Already have an account?{" "}
          <Link to="/login" data-testid="to-login" className="text-neutral-300 font-medium hover:underline">Log in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
