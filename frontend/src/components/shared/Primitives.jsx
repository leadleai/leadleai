import { motion } from "framer-motion";
import { CountUp, RevealHeading, SPRING, SOFT_SPRING } from "@/components/app/motion";

export function PageHeader({ title, subtitle, action, testid }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8" data-testid={testid}>
      <div>
        <RevealHeading
          as="h1"
          text={title}
          className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight"
        />
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}
            className="text-muted-foreground mt-1.5 text-sm"
          >
            {subtitle}
          </motion.p>
        )}
      </div>
      {action && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
          {action}
        </motion.div>
      )}
    </div>
  );
}

export function StatCard({ label, value, delta, icon: Icon, accent = "indigo", index = 0 }) {
  const negative = delta && delta.startsWith("-");
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.06, ...SOFT_SPRING }}
      whileHover={{ y: -6, transition: SPRING }}
      className="group rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 hover:border-neutral-900 dark:hover:border-white/30 hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-white/5 transition-colors duration-300"
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start justify-between">
        <motion.div
          whileHover={{ rotate: -8, scale: 1.14 }} transition={SPRING}
          className="w-10 h-10 rounded-xl bg-neutral-900 dark:bg-white flex items-center justify-center text-white dark:text-black"
        >
          {Icon && <Icon className="w-5 h-5" />}
        </motion.div>
        {delta && <span className={`text-xs font-medium ${negative ? "text-muted-foreground" : "text-neutral-900 dark:text-white"}`}>{delta}</span>}
      </div>
      <p className="text-3xl font-display font-semibold tracking-tight mt-4">
        <CountUp value={value} />
      </p>
      <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground mt-1">{label}</p>
    </motion.div>
  );
}

export function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16" data-testid="empty-state">
      <div className="w-16 h-16 rounded-2xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-center justify-center mb-4">
        {Icon && <Icon className="w-8 h-8 text-muted-foreground" />}
      </div>
      <h3 className="font-heading font-semibold text-lg">{title}</h3>
      <p className="text-muted-foreground text-sm mt-1 max-w-sm">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Shared monochrome "couldn't load" panel — replaces the old red error blocks so
// every page fails in the same high-contrast B&W style. Purely presentational.
export function ErrorState({ title = "Something went wrong", message, onRetry, retryLabel = "Try again", testid, children }) {
  return (
    <div
      className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm"
      data-testid={testid}
    >
      <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
        <AlertTriangleIcon /> {title}
      </div>
      {message && <p className="mt-1 text-muted-foreground">{message}</p>}
      {children}
      {onRetry && (
        <button onClick={onRetry} className="mt-4 text-sm font-medium underline underline-offset-4 hover:opacity-70 transition-opacity">
          {retryLabel}
        </button>
      )}
    </div>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  );
}
