import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Download, Users, Phone, Mail, CalendarClock, Loader2, AlertTriangle, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { PageHeader, StatCard, EmptyState } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import PeriodFilter from "@/components/app/PeriodFilter";
import { ANALYTICS_PERIODS } from "@/lib/backend";
import { useAnalytics, shortDay } from "@/lib/useAnalytics";
import { toast } from "sonner";

// Monochrome palette (works in light + dark) for the status pie.
const STATUS_ORDER = ["new", "contacted", "interested", "meeting_booked", "closed"];
const STATUS_LABELS = {
  new: "New", contacted: "Contacted", interested: "Interested",
  meeting_booked: "Meeting booked", closed: "Closed",
};
const PIE_COLORS = ["#525252", "#737373", "#a3a3a3", "#404040", "#d4d4d4"];
const TOOLTIP = { borderRadius: 12, border: "1px solid #8888883f", background: "rgba(23,23,23,0.92)", color: "#fff" };
const GRID = "#8888881f";

export default function Analytics() {
  const [period, setPeriod] = useState("7d");
  const { summary, timeseries, state, error, hasData, reload } = useAnalytics(period);

  const exportCsv = () => {
    if (!timeseries?.points?.length) return;
    const header = ["day", "leads", "calls_placed", "calls_failed", "emails_sent", "emails_failed"];
    const rows = timeseries.points.map((p) => header.map((k) => p[k]).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV");
  };

  const periodLabel = ANALYTICS_PERIODS.find((p) => p.value === period)?.label || "";

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle={`Real performance across your leads, calls and emails · ${periodLabel}`}
        testid="analytics-header"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <Button data-testid="export-btn" variant="outline" className="rounded-full"
              onClick={exportCsv} disabled={!hasData}>
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
          </div>
        }
      />

      {state === "loading" && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 flex items-center justify-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading analytics…
        </div>
      )}

      {state === "error" && (
        <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm" data-testid="analytics-error">
          <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
            <AlertTriangle className="w-4 h-4" /> Couldn’t load analytics
          </div>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <button onClick={reload} className="mt-4 text-sm font-medium underline underline-offset-4 hover:opacity-70 transition-opacity">Try again</button>
        </div>
      )}

      {state === "ready" && !hasData && (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/10 bg-white dark:bg-white/[0.02]">
          <EmptyState icon={BarChart3} title="No data yet for this period"
            desc="There's no lead, call or email activity in this window yet. Pick a longer period, or check back once your pipeline is active." />
        </div>
      )}

      {state === "ready" && hasData && summary && timeseries && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="New leads" value={summary.leads_new.toLocaleString()} icon={Users} index={0} />
            <StatCard label="Calls placed" value={summary.calls_placed.toLocaleString()} icon={Phone} index={1} />
            <StatCard label="Emails sent" value={summary.emails_sent.toLocaleString()} icon={Mail} index={2} />
            <StatCard label="Meetings booked" value={summary.meetings_booked.toLocaleString()} icon={CalendarClock} index={3} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard className="lg:col-span-2" title="New leads over time">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={withLabels(timeseries)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis allowDecimals={false} stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "#8888881f" }} />
                  <Bar dataKey="leads" name="Leads" fill="#737373" radius={[6, 6, 0, 0]}
                    isAnimationActive animationDuration={1100} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Lead status distribution">
              <StatusPie breakdown={summary.status_breakdown} total={summary.leads_new} />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <ChartCard title="Calls: placed vs failed">
              <TwoSeriesBars data={withLabels(timeseries)}
                a={{ key: "calls_placed", name: "Placed", fill: "#525252" }}
                b={{ key: "calls_failed", name: "Failed", fill: "#a3a3a3" }} />
              <Totals items={[["Placed", summary.calls_placed], ["Failed", summary.calls_failed]]} />
            </ChartCard>

            <ChartCard title="Emails: sent vs failed">
              <TwoSeriesBars data={withLabels(timeseries)}
                a={{ key: "emails_sent", name: "Sent", fill: "#525252" }}
                b={{ key: "emails_failed", name: "Failed", fill: "#a3a3a3" }} />
              <Totals items={[["Sent", summary.emails_sent], ["Failed", summary.emails_failed]]} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

const withLabels = (ts) => ts.points.map((p) => ({ ...p, label: shortDay(p.day) }));

function ChartCard({ title, children, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 ${className}`}
    >
      <h3 className="font-heading font-semibold text-lg mb-4">{title}</h3>
      {children}
    </motion.div>
  );
}

function TwoSeriesBars({ data, a, b }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis allowDecimals={false} stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "#8888881f" }} />
        <Legend />
        <Bar dataKey={a.key} name={a.name} fill={a.fill} radius={[6, 6, 0, 0]}
          isAnimationActive animationDuration={1000} animationEasing="ease-out" />
        <Bar dataKey={b.key} name={b.name} fill={b.fill} radius={[6, 6, 0, 0]}
          isAnimationActive animationDuration={1000} animationBegin={200} animationEasing="ease-out" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Totals({ items }) {
  return (
    <div className="flex gap-6 mt-3 pt-3 border-t border-neutral-100 dark:border-white/10">
      {items.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-neutral-400">{label}</p>
          <p className="font-heading font-bold text-lg">{value.toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}

function StatusPie({ breakdown, total }) {
  const data = STATUS_ORDER
    .map((s) => ({ name: STATUS_LABELS[s], key: s, value: breakdown?.[s] || 0 }))
    .filter((d) => d.value > 0);

  if (!total || data.length === 0) {
    return <p className="text-sm text-neutral-500 py-8 text-center">No leads created in this period.</p>;
  }
  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
            isAnimationActive animationDuration={900} animationBegin={150} animationEasing="ease-out">
            {data.map((d, i) => <Cell key={d.key} fill={PIE_COLORS[STATUS_ORDER.indexOf(d.key) % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5 mt-2">
        {data.map((d) => (
          <div key={d.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[STATUS_ORDER.indexOf(d.key) % PIE_COLORS.length] }} />
              {d.name}
            </span>
            <span className="font-medium">{d.value} ({Math.round((d.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </>
  );
}
