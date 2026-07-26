import { useNavigate } from "react-router-dom";
import { ArrowUpRight, MapPin, Clock } from "lucide-react";
import MarketingPage from "@/components/marketing/MarketingPage";
import { Reveal, Magnetic } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";

const perks = [
  { t: "Remote-first", d: "Work from anywhere. We hire the best people, wherever they are." },
  { t: "Meaningful equity", d: "Everyone owns a piece of what we're building together." },
  { t: "Health & wellness", d: "Comprehensive medical, dental, and vision for you and your family." },
  { t: "Learning budget", d: "Annual stipend for courses, conferences, and books." },
];

const roles = [
  { title: "Senior Frontend Engineer", team: "Engineering", loc: "Remote", type: "Full-time" },
  { title: "Applied ML Engineer", team: "AI", loc: "San Francisco", type: "Full-time" },
  { title: "Product Designer", team: "Design", loc: "Remote", type: "Full-time" },
  { title: "Account Executive", team: "Sales", loc: "New York", type: "Full-time" },
  { title: "Customer Success Manager", team: "Success", loc: "Remote", type: "Full-time" },
  { title: "Developer Advocate", team: "Marketing", loc: "Remote", type: "Contract" },
];

export default function Careers() {
  const navigate = useNavigate();
  return (
    <MarketingPage
      kicker="Careers"
      title="Build the future of sales."
      subtitle="We're a small team with an outsized ambition — to make every sales team superhuman. Come help us get there."
      testid="careers-page"
    >
      {/* Perks */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-3xl overflow-hidden">
        {perks.map((p, i) => (
          <Reveal key={p.t} delay={i * 0.06} className="bg-black p-7 hover:bg-white/[0.03] transition-colors">
            <h3 className="font-heading font-semibold">{p.t}</h3>
            <p className="text-sm text-neutral-500 font-light mt-2 leading-relaxed">{p.d}</p>
          </Reveal>
        ))}
      </div>

      {/* Open roles */}
      <div className="mt-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">Open positions</p>
        <div className="mt-6 border-t border-white/10">
          {roles.map((r, i) => (
            <Reveal key={r.title} delay={(i % 3) * 0.05}>
              <button
                onClick={() => navigate("/contact")}
                className="group w-full text-left grid sm:grid-cols-[1fr_auto] items-center gap-4 py-6 border-b border-white/10 hover:bg-white/[0.02] transition-colors px-2 -mx-2"
              >
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight group-hover:pl-2 transition-all">{r.title}</h3>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-sm text-neutral-500">
                    <span className="font-mono text-[11px] uppercase tracking-widest">{r.team}</span>
                    <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{r.loc}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{r.type}</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 font-medium text-sm text-neutral-400 group-hover:text-white transition-colors">
                  Apply <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Reveal delay={0.1} className="mt-16 rounded-3xl border border-white/10 bg-white/[0.02] p-10 sm:p-12 text-center">
        <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Don't see your role?</h3>
        <p className="text-neutral-400 mt-3 font-light">We're always excited to meet exceptional people. Tell us how you'd contribute.</p>
        <Magnetic strength={0.3} className="inline-block mt-7">
          <Button onClick={() => navigate("/contact")} className="rounded-full bg-white text-black hover:bg-neutral-200 px-7 h-11 font-semibold">
            Get in touch <ArrowUpRight className="w-4 h-4 ml-1" />
          </Button>
        </Magnetic>
      </Reveal>
    </MarketingPage>
  );
}
