import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Search, Microscope, Mail, Phone,
  CalendarClock, Workflow, Brain, BarChart3, Check, Star, Play, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from "@/components/ui/accordion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { features, workflowSteps, testimonials, pricing, faqs } from "@/lib/mockData";

const iconMap = { Search, Microscope, Mail, Phone, CalendarClock, Workflow, Brain, BarChart3 };
const HERO_IMG = "https://images.unsplash.com/photo-1540172777610-b15b605dd68d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";
const trustedBy = ["Vertex Labs", "Brightwave", "Cadence", "Northwind", "Globex"];

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

      {/* Hero */}
      <section className="relative overflow-hidden min-h-screen flex items-center pt-24 pb-16">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950 via-black to-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[500px] bg-white/[0.06] blur-[120px] rounded-full" />
        <div className="relative max-w-7xl mx-auto px-6 sm:px-8 grid lg:grid-cols-2 gap-10 items-center w-full">
          {/* Left */}
          <div>
            <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.02]">
              Your AI Sales Team<br />That <span className="font-display-italic font-normal">Never Sleeps.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
              className="mt-6 text-lg text-neutral-400 font-light max-w-md leading-relaxed">
              LeadPilot AI finds prospects, researches companies, sends personalized emails, makes AI calls, books meetings, and updates your CRM — autonomously.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
              className="mt-9 flex flex-col sm:flex-row gap-3">
              <Button data-testid="hero-cta-primary" onClick={() => navigate("/signup")} size="lg"
                className="rounded-full bg-white text-black hover:bg-neutral-200 px-8 h-12 text-base font-medium">
                Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <Button data-testid="hero-cta-secondary" onClick={() => navigate("/login")} size="lg" variant="ghost"
                className="rounded-full px-6 h-12 text-base text-neutral-300 hover:text-white hover:bg-white/5">
                <Play className="w-4 h-4 mr-1" /> Watch Demo
              </Button>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-16">
              <p className="text-sm font-medium text-neutral-500 mb-4">Trusted By:</p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                {trustedBy.map((c) => (
                  <span key={c} className="font-heading text-lg font-semibold text-neutral-600 hover:text-neutral-300 transition-colors" data-testid={`trusted-${c.toLowerCase().replace(/\s+/g, "-")}`}>{c}</span>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right — portrait + halo */}
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, duration: 0.8 }}
            className="relative hidden lg:block h-[640px]">
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full border-[10px] border-white/80 blur-[2px] animate-halo"
              style={{ boxShadow: "0 0 60px 12px rgba(255,255,255,0.35)" }} />
            <div className="absolute inset-0 rounded-3xl overflow-hidden">
              <img src={HERO_IMG} alt="AI" className="w-full h-full object-cover object-top grayscale contrast-125" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="py-24 scroll-mt-20 border-t border-neutral-900">
        <div className="max-w-6xl mx-auto px-6 sm:px-8">
          <p className="kicker text-neutral-500 text-center">The Autonomous Workflow</p>
          <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-center mt-3">One AI employee.<br />The entire sales cycle.</h2>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-14">
            {workflowSteps.map((step, i) => {
              const Icon = iconMap[step.icon] || Brain;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-4 w-28 transition-all cursor-default ${active === i ? "border-white bg-white text-black -translate-y-1" : "border-neutral-800 bg-neutral-950 text-neutral-500"}`}>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${active === i ? "bg-black text-white" : "bg-neutral-900 text-neutral-400"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-center">{step.label}</span>
                  </motion.div>
                  {i < workflowSteps.length - 1 && <ArrowRight className="w-4 h-4 text-neutral-700 shrink-0 hidden sm:block" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 scroll-mt-20 border-t border-neutral-900">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="max-w-2xl">
            <p className="kicker text-neutral-500">Capabilities</p>
            <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight mt-3">Everything a top sales rep does — automated.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-900 border border-neutral-900 rounded-2xl overflow-hidden mt-14">
            {features.map((f, i) => {
              const Icon = iconMap[f.icon] || Brain;
              return (
                <motion.div key={f.title} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: (i % 4) * 0.06 }}
                  className="bg-black p-7 hover:bg-neutral-950 transition-colors group" data-testid={`feature-card-${i}`}>
                  <div className="w-11 h-11 rounded-xl bg-white text-black flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-heading font-semibold text-lg">{f.title}</h3>
                  <p className="text-sm text-neutral-500 font-light mt-2 leading-relaxed">{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 border-t border-neutral-900">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <p className="kicker text-neutral-500 text-center">Loved by revenue teams</p>
          <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-center mt-3">Pipeline on autopilot.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="rounded-2xl border border-neutral-800 bg-neutral-950 p-7" data-testid={`testimonial-${i}`}>
                <div className="flex gap-0.5 mb-4">{[...Array(5)].map((_, s) => <Star key={s} className="w-4 h-4 fill-white text-white" />)}</div>
                <p className="text-neutral-200 font-light leading-relaxed">{`"${t.quote}"`}</p>
                <div className="flex items-center gap-3 mt-6">
                  <Avatar className="w-10 h-10 grayscale"><AvatarImage src={t.avatar} /><AvatarFallback>{t.name[0]}</AvatarFallback></Avatar>
                  <div><p className="font-semibold text-sm">{t.name}</p><p className="text-xs text-neutral-500">{t.role}</p></div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 scroll-mt-20 border-t border-neutral-900">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="kicker text-neutral-500">Pricing</p>
            <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight mt-3">Simple, scalable pricing.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14 max-w-5xl mx-auto">
            {pricing.map((p, i) => (
              <motion.div key={p.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                className={`rounded-2xl border p-7 flex flex-col ${p.popular ? "border-white bg-neutral-950 relative lg:scale-105" : "border-neutral-800 bg-black"}`}
                data-testid={`pricing-${p.name.toLowerCase()}`}>
                {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white text-black text-xs font-semibold px-3 py-1">Most Popular</span>}
                <h3 className="font-heading font-semibold text-lg">{p.name}</h3>
                <p className="text-sm text-neutral-500 mt-1">{p.desc}</p>
                <div className="mt-5 flex items-end gap-1"><span className="font-heading text-4xl font-bold">{p.price}</span><span className="text-neutral-500 mb-1">{p.period}</span></div>
                <ul className="mt-6 space-y-3 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-neutral-300 font-light"><Check className="w-4 h-4 text-white mt-0.5 shrink-0" />{f}</li>
                  ))}
                </ul>
                <Button data-testid={`pricing-cta-${p.name.toLowerCase()}`} onClick={() => navigate(p.name === "Enterprise" ? "/contact" : "/signup")}
                  className={`mt-7 rounded-full ${p.popular ? "bg-white text-black hover:bg-neutral-200" : "bg-transparent border border-neutral-700 text-white hover:bg-neutral-900"}`}>
                  {p.cta}
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 scroll-mt-20 border-t border-neutral-900">
        <div className="max-w-3xl mx-auto px-6 sm:px-8">
          <div className="text-center">
            <p className="kicker text-neutral-500">FAQ</p>
            <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight mt-3">Frequently asked questions.</h2>
          </div>
          <Accordion type="single" collapsible className="mt-10" data-testid="faq-accordion">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-neutral-800">
                <AccordionTrigger className="text-left font-heading font-medium hover:no-underline" data-testid={`faq-trigger-${i}`}>{f.q}</AccordionTrigger>
                <AccordionContent className="text-neutral-400 font-light leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA — inverted */}
      <section className="py-24 border-t border-neutral-900">
        <div className="max-w-5xl mx-auto px-6 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-white text-black p-10 sm:p-16 text-center">
            <div className="absolute inset-0 grain-light opacity-60" />
            <div className="relative">
              <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight">Hire your AI sales employee today.</h2>
              <p className="text-neutral-600 mt-4 max-w-xl mx-auto font-light">Join thousands of teams filling their pipeline on autopilot. Live in under 15 minutes.</p>
              <Button data-testid="cta-final-btn" onClick={() => navigate("/signup")} size="lg" className="mt-8 rounded-full bg-black text-white hover:bg-neutral-800 px-8 h-12 text-base">
                Start Free Trial <ArrowUpRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
