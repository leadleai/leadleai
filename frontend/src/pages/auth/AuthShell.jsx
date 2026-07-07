import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

const AUTH_IMG = "https://images.unsplash.com/photo-1518611540400-6b85a0704342?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000";

export default function AuthShell({ children, title, subtitle }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white dark:bg-black text-neutral-900 dark:text-white">
      {/* Left brand panel — B&W cinematic */}
      <div className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden bg-black text-white">
        <img src={AUTH_IMG} alt="" className="absolute inset-0 w-full h-full object-cover grayscale contrast-125 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/30" />
        <Link to="/" className="relative flex items-center gap-2.5" data-testid="auth-logo">
          <Plus className="w-7 h-7 text-white" strokeWidth={3} />
          <span className="font-heading font-bold text-lg">LeadPilot AI</span>
        </Link>
        <div className="relative">
          <h2 className="font-heading text-4xl font-extrabold tracking-tighter leading-[0.95]">Your AI sales team that never sleeps.</h2>
          <p className="text-neutral-400 mt-4 max-w-md font-light">Finds leads, researches accounts, writes outreach, makes calls, and books meetings — autonomously.</p>
          <div className="flex items-center gap-3 mt-8">
            <div className="flex -space-x-2">{[1,2,3,4].map(i => <div key={i} className="w-9 h-9 rounded-full bg-white/10 border-2 border-black backdrop-blur" />)}</div>
            <span className="text-sm text-neutral-400">Trusted by 2,400+ revenue teams</span>
          </div>
        </div>
        <div className="relative text-sm text-neutral-600">© 2025 LeadPilot AI</div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <Link to="/" className="lg:hidden flex items-center gap-2.5 mb-8">
            <Plus className="w-7 h-7 text-foreground" strokeWidth={3} />
            <span className="font-heading font-bold text-lg">LeadPilot AI</span>
          </Link>
          <h1 className="font-heading text-3xl font-extrabold tracking-tighter">{title}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm font-light">{subtitle}</p>
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
          className="h-11 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-all flex items-center justify-center font-semibold text-sm">
          {s.label}
        </button>
      ))}
    </div>
  );
}
