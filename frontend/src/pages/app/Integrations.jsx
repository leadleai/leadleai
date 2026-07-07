import { useState } from "react";
import { motion } from "framer-motion";
import {
  Chrome, Building2, Slack, Magnet, Cloud, GitBranch, Circle, Phone,
  Sparkles, Brain, Linkedin, Webhook, Check, RefreshCw
} from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { integrations as initial } from "@/lib/mockData";
import { toast } from "sonner";

const iconMap = { Chrome, Building2, Slack, Magnet, Cloud, GitBranch, Circle, Phone, Sparkles, Brain, Linkedin, Webhook };

export default function Integrations() {
  const [items, setItems] = useState(initial);
  const toggle = (name) => {
    setItems((arr) => arr.map((i) => i.name === name ? { ...i, connected: !i.connected } : i));
    const item = items.find((i) => i.name === name);
    toast.success(`${name} ${item.connected ? "disconnected" : "connected"}`);
  };

  return (
    <div>
      <PageHeader title="Integrations" subtitle={`${items.filter(i => i.connected).length} of ${items.length} tools connected`} testid="integrations-header"
        action={<Button data-testid="sync-btn" variant="outline" className="rounded-full" onClick={() => toast.success("All integrations synced")}><RefreshCw className="w-4 h-4 mr-1" /> Sync all</Button>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((it, i) => {
          const Icon = iconMap[it.icon] || Circle;
          return (
            <motion.div key={it.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i % 6) * 0.05 }}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5" data-testid={`integration-${it.name.toLowerCase().replace(/\s+/g,"-")}`}>
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Icon className="w-5 h-5 text-slate-600 dark:text-slate-300" /></div>
                {it.connected && <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Check className="w-3 h-3 mr-1" /> Connected</Badge>}
              </div>
              <h3 className="font-heading font-semibold mt-4">{it.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{it.desc}</p>
              <Button data-testid={`integration-toggle-${it.name.toLowerCase().replace(/\s+/g,"-")}`} onClick={() => toggle(it.name)}
                variant={it.connected ? "outline" : "default"}
                className={`mt-4 w-full rounded-full ${!it.connected ? "bg-slate-900 dark:bg-white dark:text-slate-900" : ""}`}>
                {it.connected ? "Disconnect" : "Connect"}
              </Button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
