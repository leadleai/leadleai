import { motion } from "framer-motion";
import MarketingNav from "./MarketingNav";
import MarketingFooter from "./MarketingFooter";

export default function MarketingPage({ title, subtitle, children, testid }) {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-neutral-900 dark:text-white selection:bg-neutral-200 dark:selection:bg-white dark:selection:text-black" data-testid={testid}>
      <MarketingNav />
      <section className="relative overflow-hidden pt-36 pb-14 border-b border-neutral-200 dark:border-neutral-900">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-100 dark:from-neutral-950 to-white dark:to-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[300px] bg-black/[0.03] dark:bg-white/[0.05] blur-[100px] rounded-full" />
        <div className="relative max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="font-heading text-4xl sm:text-6xl font-extrabold tracking-tighter">{title}</motion.h1>
          {subtitle && <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 text-lg text-neutral-500 dark:text-neutral-400 font-light">{subtitle}</motion.p>}
        </div>
      </section>
      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-16">{children}</main>
      <MarketingFooter />
    </div>
  );
}

export function LegalBody({ sections, updated }) {
  return (
    <div>
      <p className="text-sm text-neutral-400 dark:text-neutral-500 mb-8">Last updated: {updated}</p>
      <div className="space-y-8">
        {sections.map((s, i) => (
          <div key={i}>
            <h2 className="font-heading text-xl font-semibold mb-2">{s.h}</h2>
            <p className="text-neutral-600 dark:text-neutral-400 font-light leading-relaxed">{s.p}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
