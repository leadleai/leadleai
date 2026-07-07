import { motion } from "framer-motion";
import { Plus, Play, Pause, MoreHorizontal, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { campaigns } from "@/lib/mockData";
import { toast } from "sonner";

const statusColor = { Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", Paused: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", Draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };

export default function Campaigns() {
  return (
    <div>
      <PageHeader title="Campaigns" subtitle="Automated outreach sequences powered by AI" testid="campaigns-header"
        action={<Button data-testid="new-campaign-btn" onClick={() => toast.success("New campaign builder opened")} className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg"><Plus className="w-4 h-4 mr-1" /> New Campaign</Button>} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {campaigns.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6" data-testid={`campaign-card-${c.id}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-heading font-semibold text-lg">{c.name}</h3>
                <Badge className={`rounded-full border-0 mt-1.5 font-medium ${statusColor[c.status]}`}>{c.status}</Badge>
              </div>
              <div className="flex gap-1">
                <Button data-testid={`campaign-toggle-${c.id}`} size="icon" variant="ghost" className="rounded-lg" onClick={() => toast.success(`${c.status === "Active" ? "Paused" : "Started"} ${c.name}`)}>
                  {c.status === "Active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button size="icon" variant="ghost" className="rounded-lg" onClick={() => toast.info("Campaign options")}><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-6">
              {[["Sent", c.sent.toLocaleString()], ["Open", `${c.open}%`], ["Reply", `${c.reply}%`], ["Meetings", c.meetings]].map(([k, v]) => (
                <div key={k} className="text-center rounded-xl bg-slate-50 dark:bg-slate-800 py-3">
                  <p className="font-heading font-bold text-lg">{v}</p><p className="text-xs text-slate-400">{k}</p>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
