import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, TrendingUp, Cpu, Users2, Newspaper, DollarSign, Briefcase, Globe, MessageCircle, Lightbulb, Zap, Target } from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { leads } from "@/lib/mockData";
import { toast } from "sonner";

const sections = [
  { icon: Target, title: "Pain Points", items: ["Long SDR ramp time (3 months)", "Manual, non-personalized outreach", "Low reply rates on cold email"] },
  { icon: Cpu, title: "Technology Stack", items: ["Salesforce", "Outreach.io", "AWS", "Segment"] },
  { icon: Users2, title: "Competitors", items: ["Apollo", "Outreach", "Salesloft"] },
  { icon: Newspaper, title: "Recent News", items: ["Raised $40M Series B (Dec 2024)", "Expanded to EMEA", "Launched new product line"] },
  { icon: DollarSign, title: "Funding", items: ["$40M Series B", "Lightspeed, Accel", "$68M total raised"] },
  { icon: Briefcase, title: "Hiring", items: ["12 open sales roles", "Hiring VP of Revenue Ops", "Scaling GTM aggressively"] },
];

export default function Research() {
  const [selected, setSelected] = useState(leads[0]);
  return (
    <div>
      <PageHeader title="Company Research" subtitle="AI-generated intelligence on every account" testid="research-header" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 h-fit">
          {leads.slice(0, 6).map((l) => (
            <button key={l.id} onClick={() => setSelected(l)} data-testid={`research-company-${l.id}`}
              className={`w-full text-left rounded-xl px-3 py-2.5 transition-all ${selected.id === l.id ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              <p className="font-medium text-sm">{l.company}</p>
              <p className={`text-xs ${selected.id === l.id ? "text-white/70 dark:text-slate-500" : "text-slate-400"}`}>{l.industry}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-indigo-600 to-purple-600 relative"><div className="absolute inset-0 grain opacity-30" /></div>
            <div className="p-6 -mt-10">
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-heading font-bold text-2xl">{selected.company[0]}</div>
              <div className="flex items-start justify-between mt-3">
                <div><h2 className="font-heading text-2xl font-bold">{selected.company}</h2><p className="text-slate-500 text-sm">{selected.website} · {selected.employees} employees · {selected.revenue}</p></div>
                <Button data-testid="research-generate-btn" onClick={() => toast.success("Deep research complete")} className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600"><Sparkles className="w-4 h-4 mr-1" /> Re-run</Button>
              </div>
              <div className="mt-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 p-4">
                <div className="flex items-center gap-2 text-indigo-600 font-medium text-sm mb-1"><Sparkles className="w-4 h-4" /> AI Summary</div>
                <p className="text-sm text-slate-600 dark:text-slate-300">{selected.company} is a fast-growing {selected.industry.toLowerCase()} company showing strong buying signals — recent funding, aggressive hiring, and a tech stack ripe for our solution. {selected.contact} ({selected.title}) is the ideal entry point.</p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {sections.map((s, i) => (
              <motion.div key={s.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5" data-testid={`research-section-${i}`}>
                <div className="flex items-center gap-2 mb-3"><s.icon className="w-4 h-4 text-indigo-600" /><h4 className="font-heading font-semibold">{s.title}</h4></div>
                <ul className="space-y-1.5">{s.items.map((it) => <li key={it} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-slate-300 mt-2" />{it}</li>)}</ul>
              </motion.div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center gap-2 mb-3"><Lightbulb className="w-4 h-4 text-amber-500" /><h4 className="font-heading font-semibold">Suggested Icebreakers & Talking Points</h4></div>
            <div className="space-y-2">
              {["Congrats on the $40M Series B — how are you thinking about scaling GTM?", "Noticed you're hiring 12 SDRs — ramp time is likely top of mind.", "Your move into EMEA is a great fit for automated multilingual outreach."].map((t, i) => (
                <div key={i} className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-sm flex items-center justify-between gap-3">
                  <span>{`"${t}"`}</span>
                  <Button size="sm" variant="ghost" className="h-7 rounded-lg shrink-0" onClick={() => toast.success("Copied to email")}>Use</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
