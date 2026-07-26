import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Play, Pause, ArrowRight, Search, Microscope, Mail, Phone,
  CalendarClock, Workflow, Brain, BarChart3, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { workflowSteps, features } from "@/lib/mockData";

const iconMap = { Search, Microscope, Mail, Phone, CalendarClock, Workflow, Brain, BarChart3 };
const DEMO_POSTER = "https://images.unsplash.com/photo-1551434678-e076c223a692?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400";

const chapters = [
  { t: "0:00", label: "Meet your AI sales employee" },
  { t: "0:38", label: "Finding & researching leads" },
  { t: "1:24", label: "Personalized email + AI calls" },
  { t: "2:10", label: "Booking meetings & CRM sync" },
  { t: "2:52", label: "Analytics & continuous learning" },
];

export default function Demo() {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);

  return (
    <div className="dark min-h-screen bg-black text-white selection:bg-white selection:text-black" data-testid="demo-page">
      <MarketingNav />

      {/* Hero + video */}
      <section className="relative overflow-hidden pt-32 pb-16 border-b border-neutral-900">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950 to-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70%] h-[400px] bg-white/[0.05] blur-[120px] rounded-full" />
        <div className="relative max-w-5xl mx-auto px-6 sm:px-8 text-center">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="kicker text-neutral-500">Product Demo</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="font-display text-4xl sm:text-6xl font-semibold tracking-tight mt-3">
            See LeadPilot AI <span className="font-display-italic font-normal">in action.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="mt-4 text-lg text-neutral-400 font-light max-w-2xl mx-auto">
            Watch a 3-minute walkthrough of an autonomous sales cycle — from finding a lead to booking the meeting.
          </motion.p>

          {/* Video player */}
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, duration: 0.6 }}
            className="relative mt-12 rounded-3xl overflow-hidden border border-neutral-800 aspect-video bg-neutral-950 group cursor-pointer"
            data-testid="demo-video" onClick={() => setPlaying((p) => !p)}>
            <img src={DEMO_POSTER} alt="LeadPilot AI demo" className="w-full h-full object-cover grayscale contrast-125 opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                {playing ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center gap-3">
              <span className="text-xs font-medium text-white/90">{playing ? "Playing" : "Click to play"}</span>
              <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                <div className={`h-full bg-white transition-all duration-[3000ms] ease-linear ${playing ? "w-full" : "w-0"}`} />
              </div>
              <span className="text-xs text-white/70">3:00</span>
            </div>
          </motion.div>

          {/* Chapters */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {chapters.map((c) => (
              <button key={c.t} onClick={() => setPlaying(true)} data-testid={`demo-chapter-${c.t.replace(":", "-")}`}
                className="text-xs rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-neutral-400 hover:border-white hover:text-white transition">
                <span className="font-mono text-neutral-500 mr-1.5">{c.t}</span>{c.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* What you'll see — workflow */}
      <section className="py-20 border-b border-neutral-900">
        <div className="max-w-6xl mx-auto px-6 sm:px-8">
          <p className="kicker text-neutral-500 text-center">What you&apos;ll see</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-center mt-3">The full cycle, end to end.</h2>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-12">
            {workflowSteps.map((step, i) => {
              const Icon = iconMap[step.icon] || Brain;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 w-28 text-neutral-400">
                    <div className="w-11 h-11 rounded-xl bg-neutral-900 text-neutral-300 flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                    <span className="text-xs font-medium text-center">{step.label}</span>
                  </motion.div>
                  {i < workflowSteps.length - 1 && <ArrowRight className="w-4 h-4 text-neutral-700 shrink-0 hidden sm:block" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-20 border-b border-neutral-900">
        <div className="max-w-5xl mx-auto px-6 sm:px-8">
          <div className="grid sm:grid-cols-2 gap-4">
            {features.slice(0, 4).map((f, i) => {
              const Icon = iconMap[f.icon] || Brain;
              return (
                <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                  className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 flex gap-4">
                  <div className="w-11 h-11 shrink-0 rounded-xl bg-white text-black flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                  <div>
                    <h3 className="font-heading font-semibold">{f.title}</h3>
                    <p className="text-sm text-neutral-500 font-light mt-1 leading-relaxed">{f.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-6 sm:px-8 text-center">
          <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight">Ready to see it on your pipeline?</h2>
          <p className="text-neutral-400 mt-4 font-light">Start a free 14-day trial — live in under 15 minutes. No credit card required.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button data-testid="demo-cta-signup" onClick={() => navigate("/signup")} size="lg"
              className="rounded-full bg-white text-black hover:bg-neutral-200 px-8 h-12 text-base font-medium">
              Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button data-testid="demo-cta-contact" onClick={() => navigate("/contact")} size="lg" variant="ghost"
              className="rounded-full px-6 h-12 text-base text-neutral-300 hover:text-white hover:bg-white/5">
              Talk to sales
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-neutral-500">
            {["No credit card", "14-day free trial", "Cancel anytime"].map((x) => (
              <li key={x} className="flex items-center gap-1.5"><Check className="w-4 h-4 text-white" />{x}</li>
            ))}
          </ul>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
