import { motion } from "framer-motion";

export function PageHeader({ title, subtitle, action, testid }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6" data-testid={testid}>
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, delta, icon: Icon, accent = "indigo", index = 0 }) {
  const negative = delta && delta.startsWith("-");
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 hover:-translate-y-1 transition-transform"
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-neutral-900 dark:bg-white flex items-center justify-center text-white dark:text-black">
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        {delta && <span className={`text-xs font-medium ${negative ? "text-neutral-500" : "text-neutral-900 dark:text-white"}`}>{delta}</span>}
      </div>
      <p className="text-2xl font-heading font-bold mt-4">{value}</p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{label}</p>
    </motion.div>
  );
}

export function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16" data-testid="empty-state">
      <div className="w-16 h-16 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
        {Icon && <Icon className="w-8 h-8 text-neutral-400" />}
      </div>
      <h3 className="font-heading font-semibold text-lg">{title}</h3>
      <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1 max-w-sm">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
