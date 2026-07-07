import { useNavigate, Link } from "react-router-dom";
import AuthShell, { SocialButtons } from "./AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function Signup() {
  const navigate = useNavigate();
  const submit = (e) => {
    e.preventDefault();
    toast.success("Account created! Let's set up your workspace.");
    navigate("/onboarding");
  };
  return (
    <AuthShell title="Start your free trial" subtitle="14 days free. No credit card required.">
      <form onSubmit={submit} className="space-y-4" data-testid="signup-form">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>First name</Label><Input data-testid="signup-firstname" placeholder="Alex" className="rounded-xl h-11" required /></div>
          <div className="space-y-2"><Label>Last name</Label><Input data-testid="signup-lastname" placeholder="Johnson" className="rounded-xl h-11" required /></div>
        </div>
        <div className="space-y-2"><Label>Work email</Label><Input data-testid="signup-email" type="email" placeholder="you@company.com" className="rounded-xl h-11" required /></div>
        <div className="space-y-2"><Label>Password</Label><Input data-testid="signup-password" type="password" placeholder="Create a password" className="rounded-xl h-11" required /></div>
        <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Checkbox data-testid="signup-terms" defaultChecked className="mt-0.5" /> I agree to the Terms of Service and Privacy Policy
        </label>
        <Button data-testid="signup-submit" type="submit" className="w-full h-11 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg">Create account</Button>
        <div className="relative py-2"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200 dark:border-slate-800" /></div><span className="relative mx-auto bg-white dark:bg-slate-950 px-3 text-xs text-slate-400">OR SIGN UP WITH</span></div>
        <SocialButtons testidPrefix="signup-social" />
        <p className="text-center text-sm text-slate-500 mt-4">Already have an account? <Link to="/login" data-testid="to-login" className="text-indigo-600 font-medium hover:underline">Log in</Link></p>
      </form>
    </AuthShell>
  );
}
