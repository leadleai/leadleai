import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";
import { Download } from "lucide-react";
import { PageHeader, StatCard } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MailOpen, MessageSquare, CalendarClock, TrendingUp } from "lucide-react";
import { analyticsSeries, revenueSeries, industrySplit } from "@/lib/mockData";
import { toast } from "sonner";

const COLORS = ["#ffffff", "#a3a3a3", "#d4d4d4", "#737373"];

export default function Analytics() {
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Performance across your entire sales motion" testid="analytics-header"
        action={
          <div className="flex items-center gap-2">
            <Tabs defaultValue="weekly"><TabsList className="rounded-full"><TabsTrigger value="daily" className="rounded-full">Daily</TabsTrigger><TabsTrigger value="weekly" className="rounded-full">Weekly</TabsTrigger><TabsTrigger value="monthly" className="rounded-full">Monthly</TabsTrigger></TabsList></Tabs>
            <Button data-testid="export-btn" variant="outline" className="rounded-full" onClick={() => toast.success("Report exported to CSV")}><Download className="w-4 h-4 mr-1" /> Export</Button>
          </div>
        } />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Open Rate" value="61%" delta="+4%" icon={MailOpen} accent="indigo" index={0} />
        <StatCard label="Reply Rate" value="14.2%" delta="+2.1%" icon={MessageSquare} accent="purple" index={1} />
        <StatCard label="Meeting Rate" value="6.8%" delta="+1.2%" icon={CalendarClock} accent="sky" index={2} />
        <StatCard label="Conversion" value="3.1%" delta="+0.4%" icon={TrendingUp} accent="emerald" index={3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <h3 className="font-heading font-semibold text-lg mb-4">Revenue trend (in $k)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #262626" }} />
              <Line type="monotone" dataKey="value" stroke="#ffffff" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <h3 className="font-heading font-semibold text-lg mb-4">Top industries</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={industrySplit} innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {industrySplit.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #262626" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {industrySplit.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />{s.name}</span><span className="font-medium">{s.value}%</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <h3 className="font-heading font-semibold text-lg mb-4">Weekly engagement</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={analyticsSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #262626" }} />
              <Legend />
              <Bar dataKey="open" fill="#ffffff" radius={[6,6,0,0]} />
              <Bar dataKey="reply" fill="#a3a3a3" radius={[6,6,0,0]} />
              <Bar dataKey="meetings" fill="#737373" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <h3 className="font-heading font-semibold text-lg mb-4">Best performing</h3>
          <div className="space-y-4">
            {[
              { label: "Best campaign", value: "Fintech Founders", meta: "19% reply rate" },
              { label: "Best subject line", value: "A 60% faster ramp for {{company}}", meta: "64% open rate" },
              { label: "Best sales script", value: "Series B Congrats Opener", meta: "38% connect rate" },
              { label: "Best time to send", value: "Tuesday 10 AM PST", meta: "+22% engagement" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3 last:border-0">
                <div><p className="text-xs text-neutral-400">{r.label}</p><p className="font-medium text-sm">{r.value}</p></div>
                <span className="text-sm text-neutral-500 font-medium shrink-0 ml-3">{r.meta}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
