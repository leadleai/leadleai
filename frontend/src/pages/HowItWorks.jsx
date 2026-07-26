import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Search, Microscope, Mail, Phone,
  CalendarClock, Workflow, Brain, Plug, Target, Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import {
  Reveal, AnimatedHeading, AnimatedKicker, Magnetic, PageTransition,
} from "@/components/marketing/motion";
import { workflowSteps } from "@/lib/mockData";

const iconMap = { Search, Microscope, Mail, Phone, CalendarClock, Workflow, Brain };

const setupSteps = [
  { icon: Plug, t: "Connect your stack", d: "Link your CRM, email, and calendar in a few clicks. SaleScale reads context, never your secrets." },
  { icon: Target, t: "Describe your ICP", d: "Tell the AI who you sell to and what great looks like. It builds a targeting model from your goals." },
  { icon: Rocket, t: "Go live in 15 minutes", d: "Flip the switch. The AI starts finding, researching, and reaching out — and reports back as it works." },
];

export default function HowItWorks() {
  const navigate = useNavigate();
  return (
    <div className="dark min-h-screen bg-black text-white selection:bg-white selection:text-black" data-testid="how-it-works-page">
      <MarketingNav />
      <PageTransition>
        {/* Hero */}
        <section className="relative overflow-hidden pt-40 pb-16 border-b border-white/10">
          <div className="absolute inset-0 bw-grid opacity-50" />
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[70%] h-[420px] bg-white/[0.06] blur-[120px] rounded-full" />
          <div className="relative max-w-5xl mx-auto px-6 sm:px-8">
            <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">How it works</AnimatedKicker>
            <AnimatedHeading as="h1" text="One AI employee. The entire sales cycle." delay={0.05}
              className="font-display text-5xl sm:text-7xl font-semibold tracking-tight leading-[0.95] mt-5 max-w-3xl" />
            <Reveal delay={0.25} className="mt-6 text-lg text-neutral-400 font-light max-w-2xl leading-relaxed">
              From a cold list to a booked meeting — here is exactly what happens after you connect SaleScale AI.
            </Reveal>
          </div>
        </section>

        {/* Setup */}
        <section className="max-w-6xl mx-auto px-6 sm:px-8 py-24">
          <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500 text-center">Get started</AnimatedKicker>
          <AnimatedHeading text="Live in three steps." className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-center mt-4" />
          <div className="grid md:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-3xl overflow-hidden mt-14">
            {setupSteps.map((s, i) => (
              <Reveal key={s.t} delay={i * 0.08} className="bg-black p-9 hover:bg-white/[0.03] transition-colors group">
                <span className="font-mono text-sm text-white/25 group-hover:text-white transition-colors">Step {i + 1}</span>
                <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center my-6 group-hover:scale-110 transition-transform">
                  <s.icon className="w-5 h-5" />
                </div>
                <h3 className="font-heading font-semibold text-lg">{s.t}</h3>
                <p className="text-sm text-neutral-500 font-light mt-2.5 leading-relaxed">{s.d}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* The autonomous loop — vertical timeline */}
        <section className="border-t border-white/10 py-24">
          <div className="max-w-3xl mx-auto px-6 sm:px-8">
            <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500 text-center">The autonomous loop</AnimatedKicker>
            <AnimatedHeading text="Then it runs, forever." className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-center mt-4" />
            <div className="relative mt-16 pl-10">
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-white/15" />
              {workflowSteps.map((step, i) => {
                const Icon = iconMap[step.icon] || Brain;
                return (
                  <Reveal key={step.label} delay={i * 0.06} className="relative pb-10 last:pb-0">
                    <div className="absolute -left-10 top-0 w-10 h-10 rounded-full bg-black border border-white/20 flex items-center justify-center">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/25 transition-colors">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">{String(i + 1).padStart(2, "0")}</span>
                      <h3 className="font-heading font-semibold text-lg mt-1">{step.label}</h3>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 border-t border-white/10">
          <div className="max-w-3xl mx-auto px-6 sm:px-8 text-center">
            <AnimatedHeading text="Ready to switch it on?" className="font-display text-3xl sm:text-5xl font-semibold tracking-tight" />
            <Reveal delay={0.15} className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Magnetic strength={0.3}>
                <Button onClick={() => navigate("/signup")} size="lg" className="rounded-full bg-white text-black hover:bg-neutral-200 px-8 h-12 text-base font-semibold w-full sm:w-auto">
                  Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Magnetic>
              <Button onClick={() => navigate("/pricing")} size="lg" variant="ghost" className="rounded-full px-6 h-12 text-base text-neutral-300 hover:text-white hover:bg-white/5 border border-white/15">
                View pricing
              </Button>
            </Reveal>
          </div>
        </section>
      </PageTransition>
      <MarketingFooter />
    </div>
  );
}
