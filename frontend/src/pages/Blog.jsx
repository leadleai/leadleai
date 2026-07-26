import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import MarketingPage from "@/components/marketing/MarketingPage";
import { Reveal } from "@/components/marketing/motion";

const posts = [
  { tag: "Playbook", title: "The end of the SDR as we know it", excerpt: "Why the next generation of sales teams will be measured by output per AI agent, not headcount.", read: "6 min", date: "Jan 12, 2025", featured: true },
  { tag: "Product", title: "How our AI writes outreach that doesn't feel like AI", excerpt: "A look inside the research and personalization pipeline behind every email SaleScale sends.", read: "8 min", date: "Jan 08, 2025" },
  { tag: "Engineering", title: "Placing 10,000 natural voice calls a day", excerpt: "The architecture behind the AI Call Agent — latency, objection handling, and real-time sentiment.", read: "11 min", date: "Dec 20, 2024" },
  { tag: "Growth", title: "From cold list to booked meeting in 48 hours", excerpt: "A step-by-step teardown of an autonomous campaign that filled a founder's calendar.", read: "5 min", date: "Dec 14, 2024" },
  { tag: "Research", title: "What 200M outreach touches taught us about timing", excerpt: "The data on when prospects actually respond — and how the AI learns your best window.", read: "7 min", date: "Dec 02, 2024" },
];

export default function Blog() {
  const navigate = useNavigate();
  const [featured, ...rest] = posts;
  return (
    <MarketingPage
      kicker="Blog"
      title="Notes on autonomous sales."
      subtitle="Playbooks, product deep-dives, and what we're learning building the AI sales employee."
      testid="blog-page"
    >
      {/* Featured */}
      <Reveal>
        <button onClick={() => navigate("/contact")} className="group block w-full text-left rounded-3xl border border-white/10 bg-white/[0.02] p-8 sm:p-12 hover:border-white/25 transition-colors overflow-hidden relative">
          <div className="bw-grid absolute inset-0 opacity-40 pointer-events-none" />
          <div className="relative">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">{featured.tag} · Featured</span>
            <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.02] mt-4 max-w-3xl group-hover:opacity-80 transition-opacity">{featured.title}</h2>
            <p className="text-neutral-400 font-light mt-4 max-w-2xl leading-relaxed">{featured.excerpt}</p>
            <div className="flex items-center gap-4 mt-6 text-sm text-neutral-500">
              <span>{featured.date}</span><span>·</span><span>{featured.read} read</span>
              <ArrowUpRight className="w-5 h-5 ml-auto text-neutral-500 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
          </div>
        </button>
      </Reveal>

      {/* Grid */}
      <div className="grid sm:grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-3xl overflow-hidden mt-10">
        {rest.map((p, i) => (
          <Reveal key={p.title} delay={(i % 2) * 0.06}>
            <button onClick={() => navigate("/contact")} className="group w-full h-full text-left bg-black p-8 hover:bg-white/[0.03] transition-colors flex flex-col">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">{p.tag}</span>
              <h3 className="font-heading font-semibold text-xl mt-3 group-hover:opacity-80 transition-opacity">{p.title}</h3>
              <p className="text-sm text-neutral-500 font-light mt-2.5 leading-relaxed flex-1">{p.excerpt}</p>
              <div className="flex items-center gap-3 mt-6 text-xs text-neutral-600">
                <span>{p.date}</span><span>·</span><span>{p.read} read</span>
                <ArrowUpRight className="w-4 h-4 ml-auto group-hover:text-white transition-colors" />
              </div>
            </button>
          </Reveal>
        ))}
      </div>
    </MarketingPage>
  );
}
