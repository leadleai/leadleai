import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import AuthShell, { SocialButtons } from "./AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputOTP, InputOTPGroup, InputOTPSlot
} from "@/components/ui/input-otp";
import { toast } from "sonner";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState("credentials");
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("alex@vertexlabs.io");
  const [password, setPassword] = useState("password");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const submitCreds = (e) => {
    e.preventDefault();
    const err = {};
    if (!email.trim()) err.email = "Email is required";
    else if (!emailRe.test(email)) err.email = "Enter a valid email address";
    if (!password) err.password = "Password is required";
    setErrors(err);
    if (Object.keys(err).length) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep("2fa");
      toast.info("Verification code sent to your device");
    }, 1000);
  };
  const verify = () => {
    if (otp.length < 6) return toast.error("Enter the 6-digit code");
    setLoading(true);
    setTimeout(() => { setLoading(false); toast.success("Welcome back!"); navigate("/app"); }, 900);
  };

  return (
    <AuthShell title={step === "credentials" ? "Welcome back" : "Two-factor authentication"} subtitle={step === "credentials" ? "Log in to your LeadPilot workspace" : "Enter the 6-digit code from your authenticator app"}>
      {step === "credentials" ? (
        <form onSubmit={submitCreds} className="space-y-4" data-testid="login-form" noValidate>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input data-testid="login-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} placeholder="you@company.com" className={`rounded-xl h-11 ${errors.email ? "border-rose-400" : ""}`} />
            {errors.email && <p className="text-xs text-rose-500" data-testid="login-email-error">{errors.email}</p>}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Password</Label>
              <Link to="/forgot-password" data-testid="forgot-link" className="text-xs text-indigo-600 hover:underline">Forgot password?</Link>
            </div>
            <Input data-testid="login-password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }} placeholder="••••••••" className={`rounded-xl h-11 ${errors.password ? "border-rose-400" : ""}`} />
            {errors.password && <p className="text-xs text-rose-500" data-testid="login-password-error">{errors.password}</p>}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Checkbox data-testid="remember-me" defaultChecked /> Remember me for 30 days
          </label>
          <Button data-testid="login-submit" type="submit" disabled={loading} className="w-full h-11 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Logging in...</> : "Log in"}
          </Button>
          <div className="relative py-2"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200 dark:border-slate-800" /></div><span className="relative mx-auto bg-white dark:bg-slate-950 px-3 text-xs text-slate-400">OR CONTINUE WITH</span></div>
          <SocialButtons testidPrefix="login-social" />
          <p className="text-center text-sm text-slate-500 mt-4">Don&apos;t have an account? <Link to="/signup" data-testid="to-signup" className="text-indigo-600 font-medium hover:underline">Sign up</Link></p>
        </form>
      ) : (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6" data-testid="twofa-form">
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="otp-input">
              <InputOTPGroup>
                {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} className="w-11 h-12 rounded-xl text-lg" />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button data-testid="verify-2fa" onClick={verify} disabled={loading} className="w-full h-11 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</> : "Verify & Continue"}
          </Button>
          <button onClick={() => setStep("credentials")} className="w-full text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">← Back to login</button>
        </motion.div>
      )}
    </AuthShell>
  );
}
