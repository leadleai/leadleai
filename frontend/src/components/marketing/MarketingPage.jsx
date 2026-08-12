import MarketingNav from "./MarketingNav";
import MarketingFooter from "./MarketingFooter";
import { AnimatedHeading, AnimatedKicker, Reveal, PageTransition } from "./motion";

export default function MarketingPage({ title, subtitle, kicker, children, testid }) {
  return (
    <div className="dark min-h-screen bg-black text-white selection:bg-white selection:text-black" data-testid={testid}>
      <MarketingNav />
      <PageTransition>
        {/* Hero */}
        <section className="relative overflow-hidden pt-40 pb-16 border-b border-white/10">
          <div className="absolute inset-0 bw-grid opacity-60" />
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[70%] h-[420px] bg-white/[0.06] blur-[120px] rounded-full" />
          <div className="bw-noise absolute inset-0 opacity-[0.05] pointer-events-none" />
          <div className="relative max-w-4xl mx-auto px-5 sm:px-8">
            <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">
              {kicker || "SaleScale AI"}
            </AnimatedKicker>
            <AnimatedHeading
              as="h1"
              text={title}
              delay={0.05}
              className="font-display text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.02] sm:leading-[0.98] mt-5 break-words"
            />
            {subtitle && (
              <Reveal delay={0.25} className="mt-6 text-lg text-neutral-400 font-light max-w-2xl leading-relaxed">
                {subtitle}
              </Reveal>
            )}
          </div>
        </section>

        <main className="relative max-w-4xl mx-auto px-5 sm:px-8 py-20">{children}</main>
      </PageTransition>
      <MarketingFooter />
    </div>
  );
}

export function LegalBody({ sections, updated }) {
  return (
    <div>
      <Reveal className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 mb-12 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400">
        Last updated: {updated}
      </Reveal>
      <div className="space-y-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
        {sections.map((s, i) => (
          <Reveal
            key={i}
            delay={(i % 4) * 0.05}
            className="bg-black p-7 sm:p-9 hover:bg-white/[0.03] transition-colors group"
          >
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-sm text-neutral-600 group-hover:text-white transition-colors">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="font-heading text-xl font-semibold">{s.h.replace(/^\d+\.\s*/, "")}</h2>
                <p className="text-neutral-400 font-light leading-relaxed mt-2">{s.p}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
