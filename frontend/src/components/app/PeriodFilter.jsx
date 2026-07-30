import { ANALYTICS_PERIODS } from "@/lib/backend";
import { Button } from "@/components/ui/button";

// Segmented Today / Last 7 days / Last 30 days control shared by the Dashboard
// and Analytics pages. Controlled: parent owns `value` and gets `onChange`.
export default function PeriodFilter({ value, onChange }) {
  return (
    <div className="inline-flex rounded-full border border-neutral-200 dark:border-white/10 p-1" data-testid="period-filter">
      {ANALYTICS_PERIODS.map((p) => (
        <Button
          key={p.value}
          size="sm"
          data-testid={`period-${p.value}`}
          onClick={() => onChange(p.value)}
          variant="ghost"
          className={`rounded-full h-8 px-3 text-sm ${
            value === p.value
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          }`}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
