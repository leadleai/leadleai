import { motion } from "framer-motion";
import MarketingNav from "./MarketingNav";
import MarketingFooter from "./MarketingFooter";

export default function MarketingPage({ title, subtitle, children, testid }) {
  return (
    <div className="dark min-h-screen bg-black text-white selection:bg-white selection:text-black" data-testid={testid}>
      <MarketingNav />
      <section className="relative overflow-hidden pt-36 pb-14 border-b border-neutral-900">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950 to-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[300px] bg-white/[0.05] blur-[100px] rounded-full" />
        <div className="relative max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="font-display text-4xl sm:text-6xl font-semibold tracking-tight">{title}</motion.h1>
          {subtitle && <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 text-lg text-neutral-400 font-light">{subtitle}</motion.p>}
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
