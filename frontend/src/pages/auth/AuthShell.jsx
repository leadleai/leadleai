import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Sparkles } from "lucide-react";

export default function AuthShell({ children, title, subtitle }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white dark:bg-slate-950">
      {/* Left brand panel */}
      <div className="hidden lg:flex relative flex-col justify-between p-12 bg-gradient-to-br from-indigo-600 to-purple-700 text-white overflow-hidden">
        <div className="absolute inset-0 grain opacity-30" />
        <Link to="/" className="relative flex items-center gap-2.5" data-testid="auth-logo">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center"><Zap className="w-5 h-5 text-white" fill="white" /></div>
          <span className="font-heading font-bold text-lg">LeadPilot AI</span>
        </Link>
        <div className="relative">
          <Sparkles className="w-8 h-8 mb-5 opacity-80" />
          <h2 className="font-heading text-3xl font-bold leading-tight">Your AI sales team that never sleeps.</h2>
          <p className="text-white/80 mt-4 max-w-md">Finds leads, researches accounts, writes outreach, makes calls, and books meetings — autonomously.</p>
          <div className="flex items-center gap-3 mt-8">
            <div className="flex -space-x-2">{[1,2,3,4].map(i => <div key={i} className="w-9 h-9 rounded-full bg-white/20 border-2 border-indigo-600" />)}</div>
            <span className="text-sm text-white/80">Trusted by 2,400+ revenue teams</span>
          </div>
        </div>
        <div className="relative text-sm text-white/60">© 2025 LeadPilot AI</div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <Link to="/" className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center"><Zap className="w-5 h-5 text-white" fill="white" /></div>
            <span className="font-heading font-bold text-lg">LeadPilot AI</span>
          </Link>
          <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}

export function SocialButtons({ testidPrefix = "social" }) {
  const socials = [
    { name: "Google", label: "G" },
    { name: "Microsoft", label: "M" },
    { name: "GitHub", label: "GH" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {socials.map((s) => (
        <button key={s.name} data-testid={`${testidPrefix}-${s.name.toLowerCase()}`}
          onClick={(e) => e.preventDefault()}
          className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center font-semibold text-sm">
          {s.label}
        </button>
      ))}
    </div>
  );
}
