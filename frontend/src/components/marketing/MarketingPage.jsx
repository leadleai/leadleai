import { motion } from "framer-motion";
import MarketingNav from "./MarketingNav";
import MarketingFooter from "./MarketingFooter";

export default function MarketingPage({ title, subtitle, children, testid }) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-indigo-100" data-testid={testid}>
      <MarketingNav />
      <section className="relative overflow-hidden pt-32 pb-12">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900" />
        <div className="absolute inset-0 grain opacity-50" />
        <div className="relative max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">{title}</motion.h1>
          {subtitle && <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 text-lg text-slate-600 dark:text-slate-400">{subtitle}</motion.p>}
        </div>
      </section>
      <main className="max-w-3xl mx-auto px-5 sm:px-8 pb-24">{children}</main>
      <MarketingFooter />
    </div>
  );
}

export function LegalBody({ sections, updated }) {
  return (
    <div className="prose-slate">
      <p className="text-sm text-slate-400 mb-8">Last updated: {updated}</p>
      <div className="space-y-8">
        {sections.map((s, i) => (
          <div key={i}>
            <h2 className="font-heading text-xl font-semibold mb-2">{s.h}</h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{s.p}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
