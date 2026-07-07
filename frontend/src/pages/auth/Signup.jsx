import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthShell, { SocialButtons } from "./AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [terms, setTerms] = useState(true);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const submit = (e) => {
    e.preventDefault();
    const err = {};
    if (!form.firstName.trim()) err.firstName = "Required";
    if (!form.lastName.trim()) err.lastName = "Required";
    if (!form.email.trim()) err.email = "Email is required";
    else if (!emailRe.test(form.email)) err.email = "Enter a valid email address";
    if (!form.password) err.password = "Password is required";
    else if (form.password.length < 8) err.password = "Must be at least 8 characters";
    if (!terms) err.terms = "You must accept the terms";
    setErrors(err);
    if (Object.keys(err).length) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Account created! Let's set up your workspace.");
      navigate("/onboarding");
    }, 1200);
  };

  return (
    <AuthShell title="Start your free trial" subtitle="14 days free. No credit card required.">
      <form onSubmit={submit} className="space-y-4" data-testid="signup-form" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>First name</Label><Input data-testid="signup-firstname" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Alex" className={`rounded-xl h-11 ${errors.firstName ? "border-neutral-400" : ""}`} />{errors.firstName && <p className="text-xs text-neutral-500">{errors.firstName}</p>}</div>
          <div className="space-y-1.5"><Label>Last name</Label><Input data-testid="signup-lastname" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Johnson" className={`rounded-xl h-11 ${errors.lastName ? "border-neutral-400" : ""}`} />{errors.lastName && <p className="text-xs text-neutral-500">{errors.lastName}</p>}</div>
        </div>
        <div className="space-y-1.5"><Label>Work email</Label><Input data-testid="signup-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" className={`rounded-xl h-11 ${errors.email ? "border-neutral-400" : ""}`} />{errors.email && <p className="text-xs text-neutral-500" data-testid="signup-email-error">{errors.email}</p>}</div>
        <div className="space-y-1.5"><Label>Password</Label><Input data-testid="signup-password" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Create a password (min 8 chars)" className={`rounded-xl h-11 ${errors.password ? "border-neutral-400" : ""}`} />{errors.password && <p className="text-xs text-neutral-500" data-testid="signup-password-error">{errors.password}</p>}</div>
        <label className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          <Checkbox data-testid="signup-terms" checked={terms} onCheckedChange={(v) => { setTerms(!!v); setErrors((e) => ({ ...e, terms: undefined })); }} className="mt-0.5" /> I agree to the Terms of Service and Privacy Policy
        </label>
        {errors.terms && <p className="text-xs text-neutral-500 -mt-2">{errors.terms}</p>}
        <Button data-testid="signup-submit" type="submit" disabled={loading} className="w-full h-11 rounded-full bg-white text-black hover:shadow-lg">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</> : "Create account"}
        </Button>
        <div className="relative py-2"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-neutral-200 dark:border-neutral-800" /></div><span className="relative mx-auto bg-white dark:bg-neutral-950 px-3 text-xs text-neutral-400">OR SIGN UP WITH</span></div>
        <SocialButtons testidPrefix="signup-social" />
        <p className="text-center text-sm text-neutral-500 mt-4">Already have an account? <Link to="/login" data-testid="to-login" className="text-neutral-600 font-medium hover:underline">Log in</Link></p>
      </form>
    </AuthShell>
  );
}
