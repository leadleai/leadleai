import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/shared/Logo";

const AUTH_IMG = "https://images.unsplash.com/photo-1518611540400-6b85a0704342?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000";

export default function AuthShell({ children, title, subtitle }) {
  return (
    <div className="dark min-h-screen grid lg:grid-cols-2 bg-black text-white">
      {/* Left brand panel — B&W cinematic */}
      <div className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden bg-black text-white">
        <img src={AUTH_IMG} alt="" className="absolute inset-0 w-full h-full object-cover grayscale contrast-125 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/30" />
        <Link to="/" className="relative flex items-center gap-2.5" data-testid="auth-logo">
          <Logo className="w-7 h-7 text-white" />
          <span className="font-heading font-bold text-lg">SaleScale AI</span>
        </Link>
        <div className="relative">
          <h2 className="font-display text-4xl font-semibold tracking-tight leading-[0.95]">Your AI sales team that never sleeps.</h2>
          <p className="text-neutral-400 mt-4 max-w-md font-light">Finds leads, researches accounts, writes outreach, makes calls, and books meetings — autonomously.</p>
          <div className="flex items-center gap-3 mt-8">
            <div className="flex -space-x-2">{[1,2,3,4].map(i => <div key={i} className="w-9 h-9 rounded-full bg-white/10 border-2 border-black backdrop-blur" />)}</div>
            <span className="text-sm text-neutral-400">Trusted by 2,400+ revenue teams</span>
          </div>
        </div>
        <div className="relative text-sm text-neutral-600">© 2025 SaleScale AI</div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <Link to="/" className="lg:hidden flex items-center gap-2.5 mb-8">
            <Logo className="w-7 h-7 text-foreground" />
            <span className="font-heading font-bold text-lg">SaleScale AI</span>
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm font-light">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}

const GoogleIcon = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
    <path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.6-.2-2.36H12v4.48h6.47a5.53 5.53 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.74z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.28a12 12 0 0 0 0 10.75l3.99-3.11z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.62l3.99 3.11C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);
/**
 * Real Google sign-in via Supabase OAuth.
 *
 * (This replaces the old SocialButtons row, which merely opened
 * accounts.google.com in a new tab and signed nobody into anything.
 * Microsoft/GitHub are gone until they're enabled as Supabase providers —
 * a button that doesn't authenticate is worse than no button.)
 */
export function GoogleButton({ testid = "google-signin", label = "Continue with Google" }) {
  const { signInWithGoogle, configured } = useAuth();
  const [loading, setLoading] = useState(false);

  const go = async () => {
    setLoading(true);
    try {
      await signInWithGoogle(); // full-page redirect to Google on success
    } catch (e) {
      toast.error("Google sign-in failed", { description: e.message });
      setLoading(false);
    }
  };

  return (
    <button type="button" data-testid={testid} onClick={go} disabled={loading || !configured}
      aria-label={label} title={label}
      className="w-full h-11 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900 disabled:opacity-50 transition-all flex items-center justify-center gap-2.5 text-sm font-medium">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
      {label}
    </button>
  );
}

/** Shown when the Supabase env vars are missing, so login failures aren't a mystery. */
export function ConfigWarning({ configured }) {
  if (configured) return null;
  return (
    <div data-testid="auth-not-configured"
      className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
      <span className="font-semibold">Auth isn&apos;t configured.</span> Set{" "}
      <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_ANON_KEY</code> in{" "}
      <code>frontend/.env</code>, then restart the dev server.
    </div>
  );
}
