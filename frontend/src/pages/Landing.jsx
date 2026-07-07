import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Search, Microscope, Mail, Phone,
  CalendarClock, Workflow, Brain, BarChart3, Check, Star, Sparkles, Play, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from "@/components/ui/accordion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { features, workflowSteps, testimonials, pricing, faqs } from "@/lib/mockData";

const iconMap = { Search, Microscope, Mail, Phone, CalendarClock, Workflow, Brain, BarChart3, Sparkles };

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = location.state?.scrollTo;
    if (id) {
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [location.state]);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-indigo-100">
      <MarketingNav />

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-24 scroll-mt-20">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 animate-gradient" />
        <div className="absolute inset-0 grain opacity-60" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-400/20 dark:bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 px-4 py-1.5 text-sm text-slate-600 dark:text-slate-300 backdrop-blur mb-6">
            <Sparkles className="w-4 h-4 text-indigo-600" /> The Autonomous AI Sales Employee
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="font-heading text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
            Your AI Sales Team<br />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">That Never Sleeps</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="mt-6 text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            LeadPilot AI finds prospects, researches companies, sends personalized emails, makes AI calls, books meetings, updates your CRM, and continuously improves.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button data-testid="hero-cta-primary" onClick={() => navigate("/signup")} size="lg"
              className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-xl hover:-translate-y-0.5 transition-all px-7 h-12 text-base">
              Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button data-testid="hero-cta-secondary" onClick={() => navigate("/login")} size="lg" variant="outline"
              className="rounded-full px-7 h-12 text-base border-slate-300 dark:border-slate-700">
              <Play className="w-4 h-4 mr-1" /> Watch Demo
            </Button>
          </motion.div>
          <p className="mt-4 text-sm text-slate-400">No credit card required · 14-day free trial</p>
        </div>
      </section>

      {/* Animated workflow */}
      <section id="workflow" className="py-20 scroll-mt-20 bg-slate-50 dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 text-center">The Autonomous Workflow</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-center mt-2">One AI employee. The entire sales cycle.</h2>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-12">
            {workflowSteps.map((step, i) => {
              const Icon = iconMap[step.icon];
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-4 w-28 transition-all cursor-default ${
                      active === i ? "border-indigo-500 bg-white dark:bg-slate-800 shadow-lg shadow-indigo-500/10 -translate-y-1" : "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900"
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${active === i ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-center">{step.label}</span>
                  </motion.div>
                  {i < workflowSteps.length - 1 && <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 hidden sm:block" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Capabilities</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-2">Everything a top sales rep does — automated</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-3">Eight specialized AI agents working together, around the clock.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-14">
            {features.map((f, i) => {
              const Icon = iconMap[f.icon];
              return (
                <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 4) * 0.08 }}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all"
                  data-testid={`feature-card-${i}`}>
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white mb-4">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-heading font-semibold text-lg">{f.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-slate-50 dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Loved by revenue teams</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-2">Pipeline on autopilot</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7" data-testid={`testimonial-${i}`}>
                <div className="flex gap-0.5 mb-4">{[...Array(5)].map((_, s) => <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />)}</div>
                <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{`"${t.quote}"`}</p>
                <div className="flex items-center gap-3 mt-6">
                  <Avatar className="w-10 h-10"><AvatarImage src={t.avatar} /><AvatarFallback>{t.name[0]}</AvatarFallback></Avatar>
                  <div><p className="font-semibold text-sm">{t.name}</p><p className="text-xs text-slate-400">{t.role}</p></div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Pricing</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-2">Simple, scalable pricing</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-3">Start free. Upgrade as your pipeline grows.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14 max-w-5xl mx-auto">
            {pricing.map((p, i) => (
              <motion.div key={p.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                className={`rounded-2xl border p-7 flex flex-col ${p.popular ? "border-indigo-500 bg-white dark:bg-slate-900 shadow-2xl shadow-indigo-500/10 relative lg:scale-105" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`}
                data-testid={`pricing-${p.name.toLowerCase()}`}>
                {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold px-3 py-1">Most Popular</span>}
                <h3 className="font-heading font-semibold text-lg">{p.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{p.desc}</p>
                <div className="mt-5 flex items-end gap-1"><span className="font-heading text-4xl font-bold">{p.price}</span><span className="text-slate-400 mb-1">{p.period}</span></div>
                <ul className="mt-6 space-y-3 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Check className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <Button data-testid={`pricing-cta-${p.name.toLowerCase()}`} onClick={() => navigate(p.name === "Enterprise" ? "/contact" : "/signup")}
                  className={`mt-7 rounded-full ${p.popular ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg" : "bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-slate-800"}`}>
                  {p.cta}
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 scroll-mt-20 bg-slate-50 dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">FAQ</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-2">Frequently asked questions</h2>
          </div>
          <Accordion type="single" collapsible className="mt-10" data-testid="faq-accordion">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-slate-200 dark:border-slate-800">
                <AccordionTrigger className="text-left font-heading font-medium hover:no-underline" data-testid={`faq-trigger-${i}`}>{f.q}</AccordionTrigger>
                <AccordionContent className="text-slate-600 dark:text-slate-400 leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-700 p-10 sm:p-16 text-center text-white">
            <div className="absolute inset-0 grain opacity-30" />
            <div className="relative">
              <Shield className="w-10 h-10 mx-auto mb-4 opacity-80" />
              <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Hire your AI sales employee today</h2>
              <p className="text-white/80 mt-3 max-w-xl mx-auto">Join thousands of teams filling their pipeline on autopilot. Live in under 15 minutes.</p>
              <Button data-testid="cta-final-btn" onClick={() => navigate("/signup")} size="lg" className="mt-8 rounded-full bg-white text-indigo-700 hover:bg-white/90 px-8 h-12 text-base">
                Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <MarketingFooter />
    </div>
  );
}
