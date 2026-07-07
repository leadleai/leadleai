import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MailCheck, Loader2 } from "lucide-react";
import AuthShell from "./AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim()) return setError("Email is required");
    if (!emailRe.test(email)) return setError("Enter a valid email address");
    setError("");
    setLoading(true);
    setTimeout(() => { setLoading(false); setSent(true); toast.success("Reset link sent — check your inbox"); }, 1100);
  };
  return (
    <AuthShell title={sent ? "Check your email" : "Reset your password"} subtitle={sent ? "We've sent a password reset link to your inbox." : "Enter your email and we'll send you a reset link."}>
      {sent ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6" data-testid="reset-sent">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-50 dark:bg-neutral-500/10 mx-auto">
            <MailCheck className="w-8 h-8 text-neutral-500" />
          </div>
          <p className="text-center text-sm text-neutral-500">Didn&apos;t receive it? Check spam or <button onClick={() => setSent(false)} className="text-neutral-600 hover:underline">try again</button>.</p>
          <Link to="/login"><Button data-testid="back-to-login" variant="outline" className="w-full h-11 rounded-full">Back to login</Button></Link>
        </motion.div>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="forgot-form" noValidate>
          <div className="space-y-1.5"><Label>Email</Label><Input data-testid="forgot-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="you@company.com" className={`rounded-xl h-11 ${error ? "border-neutral-400" : ""}`} />{error && <p className="text-xs text-neutral-500" data-testid="forgot-email-error">{error}</p>}</div>
          <Button data-testid="forgot-submit" type="submit" disabled={loading} className="w-full h-11 rounded-full bg-white text-black hover:shadow-lg">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</> : "Send reset link"}
          </Button>
          <p className="text-center text-sm text-neutral-500 mt-4"><Link to="/login" className="text-neutral-600 font-medium hover:underline">← Back to login</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
