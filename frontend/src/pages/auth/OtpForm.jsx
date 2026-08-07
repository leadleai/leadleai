import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, MailCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/lib/auth";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN = 60; // Supabase rate-limits OTP sends to ~1/min by default.

/**
 * Passwordless email-OTP flow, shared by the login and signup pages.
 *
 * Two steps:
 *   1. "email" — collect the address, call signInWithOtp -> Supabase emails a code.
 *   2. "code"  — collect the 6-digit code, call verifyOtp -> a real session.
 *
 * `createUser` decides whether an unknown email is allowed to register (true on
 * signup, false on login). `onVerified` runs after a successful verification.
 */
export default function OtpForm({ testidPrefix = "otp", createUser = true, onVerified }) {
  const { signInWithOtp, verifyOtp, configured } = useAuth();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (e) => {
    e?.preventDefault?.();
    if (!emailRe.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signInWithOtp(email.trim(), { createUser });
      setStep("code");
      setCooldown(RESEND_COOLDOWN);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError("");
    setCode("");
    try {
      await signInWithOtp(email.trim(), { createUser });
      setCooldown(RESEND_COOLDOWN);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  };

  const verify = async (value) => {
    const token = (value ?? code).trim();
    if (token.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await verifyOtp(email.trim(), token);
      onVerified?.();
    } catch (e2) {
      // Supabase returns a generic "Token has expired or is invalid" for both.
      setError(e2.message || "That code is invalid or expired. Try again.");
      setLoading(false);
    }
    // On success we intentionally leave `loading` true — the page navigates away.
  };

  if (step === "email") {
    return (
      <form onSubmit={sendCode} className="space-y-4" data-testid={`${testidPrefix}-email-form`} noValidate>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input data-testid={`${testidPrefix}-email`} type="email" value={email} autoComplete="email"
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="you@company.com" className="rounded-xl h-11" />
          {error && <p className="text-xs text-red-500" data-testid={`${testidPrefix}-email-error`}>{error}</p>}
        </div>
        <Button data-testid={`${testidPrefix}-send`} type="submit" disabled={loading || !configured}
          className="w-full h-11 rounded-full bg-white text-black hover:shadow-lg">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending code…</> : "Email me a code"}
        </Button>
      </form>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="space-y-5" data-testid={`${testidPrefix}-code-step`}>
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-500/10 mx-auto">
        <MailCheck className="w-7 h-7 text-neutral-400" />
      </div>
      <p className="text-center text-sm text-neutral-400">
        Enter the 6-digit code we sent to <span className="text-neutral-200">{email.trim()}</span>.
      </p>

      <div className="flex justify-center" data-testid={`${testidPrefix}-code`}>
        <InputOTP maxLength={6} value={code} disabled={loading}
          onChange={(v) => { setCode(v); setError(""); }}
          onComplete={(v) => verify(v)}>
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} className="h-11 w-11 text-base" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {error && <p className="text-center text-sm text-red-500" data-testid={`${testidPrefix}-code-error`}>{error}</p>}

      <Button data-testid={`${testidPrefix}-verify`} type="button" onClick={() => verify()}
        disabled={loading || code.length !== 6}
        className="w-full h-11 rounded-full bg-white text-black hover:shadow-lg">
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</> : "Verify & continue"}
      </Button>

      <div className="flex items-center justify-between text-xs">
        <button type="button" data-testid={`${testidPrefix}-back`} disabled={loading}
          onClick={() => { setStep("email"); setCode(""); setError(""); }}
          className="inline-flex items-center gap-1 text-neutral-400 hover:text-neutral-200 disabled:opacity-50">
          <ArrowLeft className="w-3.5 h-3.5" /> Use a different email
        </button>
        <button type="button" data-testid={`${testidPrefix}-resend`} onClick={resend}
          disabled={cooldown > 0 || loading}
          className="text-neutral-400 hover:text-neutral-200 disabled:opacity-50 disabled:hover:text-neutral-400">
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </motion.div>
  );
}
