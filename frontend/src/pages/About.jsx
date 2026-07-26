import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingPage from "@/components/marketing/MarketingPage";
import { Reveal, Magnetic, AnimatedHeading } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";

const stats = [
  { k: "2023", v: "Founded" },
  { k: "10M+", v: "Prospects reached" },
  { k: "40+", v: "Team members" },
  { k: "3.2×", v: "Avg. pipeline lift" },
];

const values = [
  { t: "Autonomy first", d: "We build software that does the work, not software that gives you more work. If a rep would do it, the AI should too." },
  { t: "Black & white honesty", d: "No dark patterns, no inflated metrics, no hidden fees. What you see is exactly what you get." },
  { t: "Relentless quality", d: "Every email, every call, every data point is held to the standard of your best performer — because that's who it's replacing." },
  { t: "Customer obsession", d: "We measure our success in meetings booked and pipeline closed for the teams who trust us." },
];

export default function About() {
  const navigate = useNavigate();
  return (
    <MarketingPage
      kicker="Our story"
      title="We're building the autonomous sales employee."
      subtitle="SaleScale AI started with a simple question: what if hiring your next sales rep took fifteen minutes instead of three months?"
      testid="about-page"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-3xl overflow-hidden">
        {stats.map((s, i) => (
          <Reveal key={s.v} delay={i * 0.07} className="bg-black p-8 text-center hover:bg-white/[0.03] transition-colors">
            <p className="font-display text-4xl font-semibold tracking-tight">{s.k}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 mt-2">{s.v}</p>
          </Reveal>
        ))}
      </div>

      {/* Mission */}
      <div className="mt-20">
        <AnimatedHeading text="Sales teams spend most of their time on everything except selling." className="font-display text-2xl sm:text-4xl font-semibold tracking-tight leading-tight max-w-3xl" />
        <Reveal delay={0.15} className="mt-6 text-neutral-400 font-light leading-relaxed max-w-2xl space-y-4">
          <p>Prospecting, research, data entry, follow-ups — the busywork that keeps reps from the conversations that actually close deals. We set out to hand all of it to an AI that never gets tired, never forgets to follow up, and gets sharper with every interaction.</p>
          <p>Today, SaleScale AI works as a full member of revenue teams around the world — finding prospects, researching accounts, writing outreach, placing calls, and keeping the CRM perfectly up to date. Autonomously.</p>
        </Reveal>
      </div>

      {/* Values */}
      <div className="mt-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">What we believe</p>
        <div className="grid sm:grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-3xl overflow-hidden mt-6">
          {values.map((v, i) => (
            <Reveal key={v.t} delay={(i % 2) * 0.06} className="bg-black p-8 hover:bg-white/[0.03] transition-colors group">
              <span className="font-mono text-sm text-white/25 group-hover:text-white transition-colors">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="font-heading font-semibold text-lg mt-3">{v.t}</h3>
              <p className="text-sm text-neutral-500 font-light mt-2 leading-relaxed">{v.d}</p>
            </Reveal>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Reveal delay={0.1} className="mt-20 rounded-3xl border border-white/10 bg-white/[0.02] p-10 sm:p-12 text-center">
        <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Come build with us.</h3>
        <p className="text-neutral-400 mt-3 font-light">We're always looking for people who want to reinvent how sales works.</p>
        <Magnetic strength={0.3} className="inline-block mt-7">
          <Button onClick={() => navigate("/careers")} className="rounded-full bg-white text-black hover:bg-neutral-200 px-7 h-11 font-semibold">
            View open roles <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Magnetic>
      </Reveal>
    </MarketingPage>
  );
}
