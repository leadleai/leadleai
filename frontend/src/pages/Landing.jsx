import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, Search, Microscope, Mail, Phone,
  CalendarClock, Workflow, Brain, BarChart3, Check, Star, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from "@/components/ui/accordion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import {
  Reveal, AnimatedHeading, AnimatedKicker, Marquee, Magnetic, PageTransition,
} from "@/components/marketing/motion";
import { features, workflowSteps, testimonials, pricing, faqs } from "@/lib/mockData";

const iconMap = { Search, Microscope, Mail, Phone, CalendarClock, Workflow, Brain, BarChart3 };
const HERO_IMG = "https://images.unsplash.com/photo-1540172777610-b15b605dd68d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";
const trustedBy = ["Vertex Labs", "Brightwave", "Cadence", "Northwind", "Globex", "Proseware"];

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = location.state?.scrollTo;
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [location.state]);

  return (
    <div className="dark min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <MarketingNav />
      <PageTransition>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden min-h-screen flex items-center pt-28 pb-20">
          <div className="absolute inset-0 bw-grid opacity-50" />
          <div className="bw-noise absolute inset-0 opacity-[0.05] pointer-events-none" />
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[85%] h-[560px] bg-white/[0.07] blur-[130px] rounded-full" />
          <div className="relative max-w-7xl mx-auto px-6 sm:px-8 grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-center w-full">
            {/* Left */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 mb-8"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-300">Autonomous sales, on autopilot</span>
              </motion.div>

              <h1 className="font-display text-[13vw] sm:text-7xl lg:text-8xl font-semibold tracking-tight leading-[0.92]">
                <AnimatedHeading as="span" text="Your AI Sales Team" className="block" />
                <span className="block">
                  <AnimatedHeading as="span" text="That" delay={0.2} className="inline" />{" "}
                  <span className="font-display-italic font-normal bw-shine">Never Sleeps.</span>
                </span>
              </h1>

              <Reveal delay={0.3} className="mt-7 text-lg text-neutral-400 font-light max-w-lg leading-relaxed">
                SaleScale AI finds prospects, researches companies, sends personalized emails, makes AI calls, books meetings, and updates your CRM — autonomously.
              </Reveal>

              <Reveal delay={0.4} className="mt-9 flex flex-col sm:flex-row gap-3">
                <Magnetic strength={0.35}>
                  <Button data-testid="hero-cta-primary" onClick={() => navigate("/enquiry")} size="lg"
                    className="group rounded-full bg-white text-black hover:bg-neutral-200 px-8 h-12 text-base font-semibold w-full sm:w-auto">
                    Get in touch <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Magnetic>
                <Button data-testid="hero-cta-secondary" onClick={() => navigate("/demo")} size="lg" variant="ghost"
                  className="group rounded-full px-6 h-12 text-base text-neutral-300 hover:text-white hover:bg-white/5 border border-white/15">
                  <Play className="w-4 h-4 mr-1.5 transition-transform group-hover:scale-110" /> Watch Demo
                </Button>
              </Reveal>

              <Reveal delay={0.5} className="mt-14">
                <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-neutral-600 mb-5">Trusted by revenue teams</p>
                <Marquee duration={26} className="max-w-lg [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
                  {trustedBy.map((c) => (
                    <span key={c} className="font-heading text-xl font-semibold text-neutral-600 px-6 whitespace-nowrap"
                      data-testid={`trusted-${c.toLowerCase().replace(/\s+/g, "-")}`}>{c}</span>
                  ))}
                </Marquee>
              </Reveal>
            </div>

            {/* Right — portrait + rotating halo */}
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="relative hidden lg:block h-[640px]">
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full border border-dashed border-white/20 animate-spin-slow" />
              <div className="absolute top-10 left-1/2 -translate-x-1/2 w-60 h-60 rounded-full border-[10px] border-white/80 blur-[2px] animate-halo"
                style={{ boxShadow: "0 0 70px 14px rgba(255,255,255,0.35)" }} />
              <div className="absolute inset-0 rounded-[2rem] overflow-hidden border border-white/10">
                <img src={HERO_IMG} alt="AI" className="w-full h-full object-cover object-top grayscale contrast-125" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
                <div className="bw-noise absolute inset-0 opacity-20 mix-blend-overlay" />
              </div>
              {/* floating stat chips */}
              <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute bottom-16 -left-4 rounded-2xl border border-white/15 bg-black/80 backdrop-blur px-4 py-3">
                <p className="font-display text-2xl font-semibold">3.2×</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Pipeline growth</p>
              </motion.div>
              <motion.div animate={{ y: [0, 12, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-24 -right-2 rounded-2xl border border-white/15 bg-black/80 backdrop-blur px-4 py-3">
                <p className="font-display text-2xl font-semibold">24/7</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Always working</p>
              </motion.div>
            </motion.div>
          </div>

          {/* scroll cue */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center gap-2">
            <div className="w-5 h-8 rounded-full border border-white/20 flex justify-center pt-1.5">
              <span className="w-1 h-1.5 rounded-full bg-white/60 animate-scroll-cue" />
            </div>
          </div>
        </section>

        {/* ── Stats band ───────────────────────────────────────── */}
        <section className="border-y border-white/10 bg-white/[0.02]">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/10">
            {[
              { k: "10M+", v: "Prospects reached" },
              { k: "61%", v: "Avg. open rate" },
              { k: "22", v: "Meetings / week" },
              { k: "<15m", v: "Time to go live" },
            ].map((s, i) => (
              <Reveal key={s.v} delay={i * 0.08} className="py-10 px-6 text-center">
                <p className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">{s.k}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 mt-2">{s.v}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Workflow ─────────────────────────────────────────── */}
        <section id="workflow" className="py-28 scroll-mt-20">
          <div className="max-w-6xl mx-auto px-6 sm:px-8">
            <div className="text-center">
              <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">The Autonomous Workflow</AnimatedKicker>
              <AnimatedHeading text="One AI employee. The entire sales cycle." className="font-display text-3xl sm:text-5xl font-semibold tracking-tight mt-4 max-w-2xl mx-auto leading-tight" />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-16">
              {workflowSteps.map((step, i) => {
                const Icon = iconMap[step.icon] || Brain;
                return (
                  <div key={step.label} className="flex items-center gap-3">
                    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}
                      onMouseEnter={() => setActive(i)}
                      className={`flex flex-col items-center gap-2.5 rounded-2xl border p-4 w-28 transition-all duration-300 cursor-default ${active === i ? "border-white bg-white text-black -translate-y-1.5 shadow-[0_20px_50px_-15px_rgba(255,255,255,0.4)]" : "border-white/10 bg-white/[0.02] text-neutral-500"}`}>
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${active === i ? "bg-black text-white" : "bg-white/5 text-neutral-400"}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-medium text-center">{step.label}</span>
                    </motion.div>
                    {i < workflowSteps.length - 1 && <ArrowRight className="w-4 h-4 text-white/20 shrink-0 hidden sm:block" />}
                  </div>
                );
              })}
            </div>
            <Reveal delay={0.2} className="mt-12 text-center">
              <Link to="/how-it-works" className="group inline-flex items-center gap-1.5 font-medium uppercase tracking-widest text-sm border-b border-white/30 pb-1 hover:border-white transition-colors">
                See how it works <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────── */}
        <section id="features" className="py-28 scroll-mt-20 border-t border-white/10">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <div className="max-w-2xl">
              <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">Capabilities</AnimatedKicker>
              <AnimatedHeading text="Everything a top sales rep does — automated." className="font-display text-3xl sm:text-5xl font-semibold tracking-tight mt-4 leading-tight" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-3xl overflow-hidden mt-16">
              {features.map((f, i) => {
                const Icon = iconMap[f.icon] || Brain;
                return (
                  <motion.div key={f.title} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: (i % 4) * 0.06 }}
                    className="relative bg-black p-8 hover:bg-white/[0.03] transition-colors group overflow-hidden" data-testid={`feature-card-${i}`}>
                    <span className="absolute top-5 right-6 font-mono text-xs text-white/15 group-hover:text-white/40 transition-colors">{String(i + 1).padStart(2, "0")}</span>
                    <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-heading font-semibold text-lg">{f.title}</h3>
                    <p className="text-sm text-neutral-500 font-light mt-2.5 leading-relaxed">{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>
            <Reveal delay={0.1} className="mt-12">
              <Link to="/features" className="group inline-flex items-center gap-1.5 font-medium uppercase tracking-widest text-sm border-b border-white/30 pb-1 hover:border-white transition-colors">
                Explore all features <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ── Testimonials marquee ─────────────────────────────── */}
        <section className="py-28 border-t border-white/10 overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 text-center mb-16">
            <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">Loved by revenue teams</AnimatedKicker>
            <AnimatedHeading text="Pipeline on autopilot." className="font-display text-3xl sm:text-5xl font-semibold tracking-tight mt-4" />
          </div>
          <Marquee duration={44} className="[mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
            {testimonials.concat(testimonials).map((t, i) => (
              <div key={i} className="w-[360px] shrink-0 mx-3 rounded-3xl border border-white/10 bg-white/[0.02] p-8" data-testid={`testimonial-${i}`}>
                <div className="flex gap-0.5 mb-4">{[...Array(5)].map((_, s) => <Star key={s} className="w-4 h-4 fill-white text-white" />)}</div>
                <p className="text-neutral-200 font-light leading-relaxed">{`"${t.quote}"`}</p>
                <div className="flex items-center gap-3 mt-6">
                  <Avatar className="w-10 h-10 grayscale"><AvatarImage src={t.avatar} /><AvatarFallback>{t.name[0]}</AvatarFallback></Avatar>
                  <div><p className="font-semibold text-sm">{t.name}</p><p className="text-xs text-neutral-500">{t.role}</p></div>
                </div>
              </div>
            ))}
          </Marquee>
        </section>

        {/* ── Pricing ──────────────────────────────────────────── */}
        <section id="pricing" className="py-28 scroll-mt-20 border-t border-white/10">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <div className="text-center max-w-2xl mx-auto">
              <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">Pricing</AnimatedKicker>
              <AnimatedHeading text="Simple, scalable pricing." className="font-display text-3xl sm:text-5xl font-semibold tracking-tight mt-4" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-5xl mx-auto">
              {pricing.map((p, i) => (
                <motion.div key={p.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                  className={`relative rounded-3xl border p-8 flex flex-col transition-transform duration-300 hover:-translate-y-1.5 ${p.popular ? "border-white bg-white text-black lg:scale-105" : "border-white/10 bg-white/[0.02]"}`}
                  data-testid={`pricing-${p.name.toLowerCase()}`}>
                  {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-black text-white text-[10px] font-mono uppercase tracking-widest px-3 py-1">Most Popular</span>}
                  <h3 className="font-heading font-semibold text-lg">{p.name}</h3>
                  <p className={`text-sm mt-1 ${p.popular ? "text-neutral-600" : "text-neutral-500"}`}>{p.desc}</p>
                  <div className="mt-6 flex items-end gap-1"><span className="font-display text-5xl font-semibold tracking-tight">{p.price}</span><span className={`mb-1.5 ${p.popular ? "text-neutral-500" : "text-neutral-500"}`}>{p.period}</span></div>
                  <ul className="mt-7 space-y-3 flex-1">
                    {p.features.map((f) => (
                      <li key={f} className={`flex items-start gap-2 text-sm font-light ${p.popular ? "text-neutral-700" : "text-neutral-300"}`}><Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.popular ? "text-black" : "text-white"}`} />{f}</li>
                    ))}
                  </ul>
                  <Button data-testid={`pricing-cta-${p.name.toLowerCase()}`} onClick={() => navigate(p.name === "Enterprise" ? "/contact" : "/signup")}
                    className={`mt-8 rounded-full h-11 font-semibold ${p.popular ? "bg-black text-white hover:bg-neutral-800" : "bg-white text-black hover:bg-neutral-200"}`}>
                    {p.cta}
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section id="faq" className="py-28 scroll-mt-20 border-t border-white/10">
          <div className="max-w-3xl mx-auto px-6 sm:px-8">
            <div className="text-center">
              <AnimatedKicker className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">FAQ</AnimatedKicker>
              <AnimatedHeading text="Frequently asked questions." className="font-display text-3xl sm:text-5xl font-semibold tracking-tight mt-4" />
            </div>
            <Accordion type="single" collapsible className="mt-12" data-testid="faq-accordion">
              {faqs.map((f, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border-white/10">
                  <AccordionTrigger className="text-left font-heading font-medium hover:no-underline py-5" data-testid={`faq-trigger-${i}`}>{f.q}</AccordionTrigger>
                  <AccordionContent className="text-neutral-400 font-light leading-relaxed">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ── Final CTA — inverted ─────────────────────────────── */}
        <section className="py-28 border-t border-white/10">
          <div className="max-w-6xl mx-auto px-6 sm:px-8">
            <Reveal className="relative overflow-hidden rounded-[2rem] bg-white text-black p-12 sm:p-20 text-center">
              <div className="absolute inset-0 bw-grid-light opacity-60" />
              <div className="relative">
                <h2 className="font-display text-4xl sm:text-6xl font-semibold tracking-tight leading-[0.98]">Hire your AI sales<br />employee today.</h2>
                <p className="text-neutral-600 mt-6 max-w-xl mx-auto font-light text-lg">Join thousands of teams filling their pipeline on autopilot. Live in under 15 minutes.</p>
                <Magnetic strength={0.3} className="inline-block mt-9">
                  <Button data-testid="cta-final-btn" onClick={() => navigate("/signup")} size="lg" className="group rounded-full bg-black text-white hover:bg-neutral-800 px-9 h-14 py-4 text-base font-semibold">
                    Start Free Trial <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Button>
                </Magnetic>
              </div>
            </Reveal>
          </div>
        </section>

      </PageTransition>
      <MarketingFooter />
    </div>
  );
}
