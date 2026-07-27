import { useState } from "react";
import {
  Users, Mail, Phone, CalendarClock, MessageSquare, MailOpen, TrendingUp, DollarSign,
  Loader2, AlertTriangle, LineChart as LineIcon, Activity as ActivityIcon,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { StatCard, PageHeader } from "@/components/shared/Primitives";
import PeriodFilter from "@/components/app/PeriodFilter";
import { useAnalytics, shortDay, timeAgo } from "@/lib/useAnalytics";
import { useAuth } from "@/lib/auth";

const STATUS_LABELS = {
  new: "New", contacted: "Contacted", interested: "Interested",
  meeting_booked: "Meeting booked", closed: "Closed",
};
const TOOLTIP = { borderRadius: 12, border: "1px solid #8888883f", background: "rgba(23,23,23,0.92)", color: "#fff" };
const ACTIVITY_ICON = { lead: Users, call: Phone, email: Mail };

// Greeting by the viewer's LOCAL time: morning <12pm, afternoon 12–5pm, else evening.
function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Real name from the Supabase auth profile; fall back to email local-part, then "there".
function firstName(user) {
  const meta = user?.user_metadata || {};
  const full = (meta.full_name || meta.name || "").trim();
  if (full) return full.split(/\s+/)[0];
  const email = user?.email || "";
  if (email.includes("@")) return email.split("@")[0];
  return "there";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("7d");
  const { summary, timeseries, activity, state, error, reload } = useAnalytics(period, { withActivity: true });

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${firstName(user)} 👋`}
        subtitle="Here's what's happening across your leads, calls and emails."
        testid="dashboard-header"
        action={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      {state === "loading" && <LoadingBlock />}
      {state === "error" && <ErrorBlock error={error} onRetry={reload} />}

      {state === "ready" && summary && timeseries && (
        <>
          {/* All cards always visible. Zeros are shown, never hidden. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Leads" value={summary.leads_new.toLocaleString()} icon={Users} index={0} />
            <StatCard label="Emails Sent" value={summary.emails_sent.toLocaleString()} icon={Mail} index={1} />
            <StatCard label="Calls Made" value={summary.calls_placed.toLocaleString()} icon={Phone} index={2} />
            <StatCard label="Meetings Booked" value={summary.meetings_booked.toLocaleString()} icon={CalendarClock} index={3} />
            {/* No real data source in this app yet — kept visible at 0 (see summary). */}
            <StatCard label="Reply Rate" value="0%" icon={MessageSquare} index={4} />
            <StatCard label="Open Rate" value="0%" icon={MailOpen} index={5} />
            <StatCard label="Pipeline Value" value="$0" icon={TrendingUp} index={6} />
            <StatCard label="Revenue Forecast" value="$0" icon={DollarSign} index={7} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-semibold text-lg">New leads over time</h3>
                <LineIcon className="w-5 h-5 text-neutral-400" />
              </div>
              <LeadsAreaChart points={timeseries.points} />
            </div>

            <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6">
              <h3 className="font-heading font-semibold text-lg mb-4">Leads by status</h3>
              <StatusBreakdown breakdown={summary.status_breakdown} total={summary.leads_new} />
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 mt-6">
            <div className="flex items-center gap-2 mb-4">
              <ActivityIcon className="w-5 h-5 text-neutral-400" />
              <h3 className="font-heading font-semibold text-lg">Recent activity</h3>
            </div>
            <ActivityFeed items={activity?.items || []} />
          </div>
        </>
      )}
    </div>
  );
}

function LeadsAreaChart({ points }) {
  const data = points.map((p) => ({ ...p, label: shortDay(p.day) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="dashLeads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#737373" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#737373" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#8888881f" vertical={false} />
        <XAxis dataKey="label" stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis allowDecimals={false} stroke="#a3a3a3" fontSize={12} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={TOOLTIP} />
        <Area type="monotone" dataKey="leads" name="Leads" stroke="#737373" fill="url(#dashLeads)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function StatusBreakdown({ breakdown, total }) {
  const order = ["new", "contacted", "interested", "meeting_booked", "closed"];
  return (
    <div className="space-y-3">
      {!total && <p className="text-sm text-neutral-500 mb-1">No leads created in this period.</p>}
      {order.map((s) => {
        const count = breakdown?.[s] || 0;
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <div key={s} data-testid={`status-${s}`}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-neutral-600 dark:text-neutral-300">{STATUS_LABELS[s]}</span>
              <span className="font-medium">{count}</span>
            </div>
            <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div className="h-full rounded-full bg-neutral-700 dark:bg-neutral-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityFeed({ items }) {
  if (!items.length) {
    return (
      <div className="py-10 flex flex-col items-center text-center text-neutral-500" data-testid="activity-empty">
        <ActivityIcon className="w-8 h-8 text-neutral-400 mb-2" />
        <p className="text-sm">No recent activity</p>
        <p className="text-xs text-neutral-400 mt-0.5">New leads, calls and emails in this period will show here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1" data-testid="activity-feed">
      {items.map((a) => {
        const Icon = ACTIVITY_ICON[a.type] || ActivityIcon;
        const failed = a.status === "failed";
        return (
          <div key={a.id} data-testid={`activity-${a.id}`}
            className="flex items-center gap-3 py-2.5 border-b border-neutral-100 dark:border-white/10 last:border-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              failed ? "border-neutral-400 dark:border-white/30 bg-transparent" : "border-transparent bg-neutral-100 dark:bg-white/5"}`}>
              <Icon className={`w-4 h-4 ${failed ? "text-neutral-900 dark:text-white" : "text-muted-foreground"}`} />
            </div>
            <p className="text-sm flex-1">{a.label}</p>
            <span className="text-xs text-neutral-400 shrink-0">{timeAgo(a.at)}</span>
          </div>
        );
      })}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-20 flex items-center justify-center gap-2 text-sm text-neutral-500">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading your stats…
    </div>
  );
}

function ErrorBlock({ error, onRetry }) {
  return (
    <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm" data-testid="dashboard-error">
      <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
        <AlertTriangle className="w-4 h-4" /> Couldn’t load your stats
      </div>
      <p className="mt-1 text-muted-foreground">{error}</p>
      <button onClick={onRetry} className="mt-4 text-sm font-medium underline underline-offset-4 hover:opacity-70 transition-opacity">Try again</button>
    </div>
  );
}
