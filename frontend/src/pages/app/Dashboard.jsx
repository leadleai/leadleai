import { motion } from "framer-motion";
import {
  Users, Mail, Phone, CalendarClock, TrendingUp, MailOpen, DollarSign,
  LineChart as LineIcon, Mail as MailI, MessageSquare, Calendar as CalI, Kanban, Sparkles, ArrowRight
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip, CartesianGrid } from "recharts";
import { StatCard, PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { activities, recommendations, analyticsSeries } from "@/lib/mockData";
import { toast } from "sonner";

const iconMap = { Mail: MailI, MessageSquare, Calendar: CalI, Phone, Users, Kanban };

export default function Dashboard() {
  return (
    <div>
      <PageHeader title="Good morning, Alex 👋" subtitle="Here's what your AI sales employee accomplished today." testid="dashboard-header"
        action={<Button data-testid="dashboard-generate-btn" onClick={() => toast.success("AI is generating new leads...")} className="rounded-full bg-white text-black hover:shadow-lg"><Sparkles className="w-4 h-4 mr-1" /> Run AI Agent</Button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Leads Found Today" value="142" delta="+12%" icon={Users} accent="indigo" index={0} />
        <StatCard label="Emails Sent" value="1,284" delta="+8%" icon={Mail} accent="purple" index={1} />
        <StatCard label="Calls Made" value="96" delta="+21%" icon={Phone} accent="sky" index={2} />
        <StatCard label="Meetings Booked" value="24" delta="+16%" icon={CalendarClock} accent="emerald" index={3} />
        <StatCard label="Reply Rate" value="14.2%" delta="+2.1%" icon={MessageSquare} accent="amber" index={4} />
        <StatCard label="Open Rate" value="61%" delta="+4%" icon={MailOpen} accent="rose" index={5} />
        <StatCard label="Pipeline Value" value="$1.2M" delta="+18%" icon={TrendingUp} accent="indigo" index={6} />
        <StatCard label="Revenue Forecast" value="$486k" delta="+9%" icon={DollarSign} accent="emerald" index={7} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-lg">Engagement this week</h3>
            <LineIcon className="w-5 h-5 text-neutral-400" />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={analyticsSeries}>
              <defs>
                <linearGradient id="cOpen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffffff" stopOpacity={0.3} /><stop offset="100%" stopColor="#ffffff" stopOpacity={0} /></linearGradient>
                <linearGradient id="cReply" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a3a3a3" stopOpacity={0.3} /><stop offset="100%" stopColor="#a3a3a3" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #262626" }} />
              <Area type="monotone" dataKey="open" stroke="#ffffff" fill="url(#cOpen)" strokeWidth={2} />
              <Area type="monotone" dataKey="reply" stroke="#a3a3a3" fill="url(#cReply)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <div className="flex items-center gap-2 mb-4"><Sparkles className="w-5 h-5 text-neutral-600" /><h3 className="font-heading font-semibold text-lg">AI Recommendations</h3></div>
          <div className="space-y-3">
            {recommendations.map((r) => (
              <div key={r.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3.5" data-testid={`recommendation-${r.id}`}>
                <p className="font-medium text-sm">{r.title}</p>
                <p className="text-xs text-neutral-500 mt-1">{r.desc}</p>
                <button onClick={() => toast.success(`Applied: ${r.title}`)} className="text-xs text-neutral-600 font-medium mt-2 inline-flex items-center gap-1 hover:gap-2 transition-all">{r.action} <ArrowRight className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 mt-6">
        <h3 className="font-heading font-semibold text-lg mb-4">Recent activity</h3>
        <div className="space-y-1">
          {activities.map((a, i) => {
            const Icon = iconMap[a.icon] || MailI;
            return (
              <motion.div key={a.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 py-2.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0" data-testid={`activity-${a.id}`}>
                <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-neutral-500" /></div>
                <p className="text-sm flex-1">{a.text}</p>
                <span className="text-xs text-neutral-400 shrink-0">{a.time}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
