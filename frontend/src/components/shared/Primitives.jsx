import { motion } from "framer-motion";

export function PageHeader({ title, subtitle, action, testid }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6" data-testid={testid}>
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, delta, icon: Icon, accent = "indigo", index = 0 }) {
  const accents = {
    indigo: "from-indigo-500 to-indigo-600",
    purple: "from-purple-500 to-purple-600",
    emerald: "from-emerald-500 to-emerald-600",
    sky: "from-sky-500 to-sky-600",
    amber: "from-amber-500 to-amber-600",
    rose: "from-rose-500 to-rose-600",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:-translate-y-1 transition-transform"
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${accents[accent]} flex items-center justify-center text-white`}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        {delta && <span className={`text-xs font-medium ${delta.startsWith("-") ? "text-rose-500" : "text-emerald-500"}`}>{delta}</span>}
      </div>
      <p className="text-2xl font-heading font-bold mt-4">{value}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </motion.div>
  );
}

export function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16" data-testid="empty-state">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
        {Icon && <Icon className="w-8 h-8 text-slate-400" />}
      </div>
      <h3 className="font-heading font-semibold text-lg">{title}</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-sm">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
