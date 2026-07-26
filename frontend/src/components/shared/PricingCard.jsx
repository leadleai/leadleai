import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PricingCard({ name, desc, price, period, features = [], cta, popular = false, onCtaClick, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}
      className={`rounded-2xl border p-7 flex flex-col ${popular ? "border-neutral-500 bg-white dark:bg-neutral-900 shadow-2xl shadow-neutral-500/10 relative" : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"}`}
      data-testid={`pricing-card-${name.toLowerCase()}`}
    >
      {popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white text-black text-xs font-semibold px-3 py-1">Most Popular</span>}
      <h3 className="font-heading font-semibold text-lg">{name}</h3>
      {desc && <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{desc}</p>}
      <div className="mt-5 flex items-end gap-1">
        <span className="font-heading text-4xl font-bold">{price}</span>
        {period && <span className="text-neutral-400 mb-1">{period}</span>}
      </div>
      <ul className="mt-6 space-y-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <Check className="w-4 h-4 text-neutral-600 mt-0.5 shrink-0" />{f}
          </li>
        ))}
      </ul>
      <Button
        data-testid={`pricing-card-cta-${name.toLowerCase()}`}
        onClick={onCtaClick}
        className={`mt-7 rounded-full ${popular ? "bg-white text-black hover:shadow-lg" : "bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-800"}`}
      >
        {cta}
      </Button>
    </motion.div>
  );
}
