import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MailCheck } from "lucide-react";
import AuthShell from "./AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    setSent(true);
    toast.success("Reset link sent — check your inbox");
  };
  return (
    <AuthShell title={sent ? "Check your email" : "Reset your password"} subtitle={sent ? "We've sent a password reset link to your inbox." : "Enter your email and we'll send you a reset link."}>
      {sent ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6" data-testid="reset-sent">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 mx-auto">
            <MailCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <p className="text-center text-sm text-slate-500">Didn&apos;t receive it? Check spam or <button onClick={() => setSent(false)} className="text-indigo-600 hover:underline">try again</button>.</p>
          <Link to="/login"><Button data-testid="back-to-login" variant="outline" className="w-full h-11 rounded-full">Back to login</Button></Link>
        </motion.div>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
          <div className="space-y-2"><Label>Email</Label><Input data-testid="forgot-email" type="email" placeholder="you@company.com" className="rounded-xl h-11" required /></div>
          <Button data-testid="forgot-submit" type="submit" className="w-full h-11 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg">Send reset link</Button>
          <p className="text-center text-sm text-slate-500 mt-4"><Link to="/login" className="text-indigo-600 font-medium hover:underline">← Back to login</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
