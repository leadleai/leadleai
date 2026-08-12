import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Search, Microscope, Mail, Phone,
  CalendarClock, Workflow, Brain, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import {
  Reveal, AnimatedHeading, AnimatedKicker, Magnetic, PageTransition,
} from "@/components/marketing/motion";
import { features } from "@/lib/mockData";

const iconMap = { Search, Microscope, Mail, Phone, CalendarClock, Workflow, Brain, BarChart3 };

export default function Features() {
  const navigate = useNavigate();
  return (
    <div className="dark min-h-screen bg-black text-white selection:bg-white selection:text-black" data-testid="features-page">
      <MarketingNav />
      <PageTransition>
        {/* Hero */}
        <section className="relative overflow-hidden pt-40 pb-16 border-b border-white/10">
          <div className="absolute inset-0 bw-grid opacity-50" />
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[70%] h-[420px] bg-white/[0.06] blur-[120px] rounded-full" />
          <div className="relative max-w-5xl mx-auto px-6 sm:px-8">
            <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">Capabilities</AnimatedKicker>
            <AnimatedHeading as="h1" text="Everything a top sales rep does — automated." delay={0.05}
              className="font-display text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.02] sm:leading-[0.95] mt-5 max-w-3xl break-words" />
            <Reveal delay={0.25} className="mt-6 text-lg text-neutral-400 font-light max-w-2xl leading-relaxed">
              Eight specialized AI agents working as one autonomous employee — from first touch to booked meeting to CRM update.
            </Reveal>
          </div>
        </section>

        {/* Feature list — alternating big rows */}
        <section className="max-w-6xl mx-auto px-6 sm:px-8 py-20">
          <div className="border-t border-white/10">
            {features.map((f, i) => {
              const Icon = iconMap[f.icon] || Brain;
              return (
                <Reveal key={f.title} delay={(i % 2) * 0.05}
                  className="group grid md:grid-cols-[auto_1fr_auto] items-center gap-6 md:gap-10 py-10 border-b border-white/10 hover:bg-white/[0.02] transition-colors px-2 -mx-2">
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-sm text-white/25 group-hover:text-white transition-colors">{String(i + 1).padStart(2, "0")}</span>
                    <div className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">{f.title}</h3>
                    <p className="text-neutral-400 font-light mt-2 leading-relaxed max-w-xl">{f.desc}</p>
                  </div>
                  <ArrowRight className="hidden md:block w-6 h-6 text-white/20 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 border-t border-white/10">
          <div className="max-w-3xl mx-auto px-6 sm:px-8 text-center">
            <AnimatedHeading text="See it run on your pipeline." className="font-display text-3xl sm:text-5xl font-semibold tracking-tight" />
            <Reveal delay={0.15} className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Magnetic strength={0.3}>
                <Button onClick={() => navigate("/signup")} size="lg" className="rounded-full bg-white text-black hover:bg-neutral-200 px-8 h-12 text-base font-semibold w-full sm:w-auto">
                  Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Magnetic>
              <Button onClick={() => navigate("/demo")} size="lg" variant="ghost" className="rounded-full px-6 h-12 text-base text-neutral-300 hover:text-white hover:bg-white/5 border border-white/15">
                Watch Demo
              </Button>
            </Reveal>
          </div>
        </section>
      </PageTransition>
      <MarketingFooter />
    </div>
  );
}
