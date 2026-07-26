import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PricingCard({ name, desc, price, period, features = [], cta, popular = false, onCtaClick, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      transition={{ delay: index * 0.09, ease: [0.16, 1, 0.3, 1] }}
      className={`relative rounded-3xl border p-8 flex flex-col transition-transform duration-300 hover:-translate-y-1.5 ${
        popular ? "border-white bg-white text-black lg:scale-105" : "border-white/10 bg-white/[0.02] text-white"
      }`}
      data-testid={`pricing-card-${name.toLowerCase()}`}
    >
      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-black text-white text-[10px] font-mono uppercase tracking-widest px-3 py-1">
          Most Popular
        </span>
      )}
      <h3 className="font-heading font-semibold text-lg">{name}</h3>
      {desc && <p className={`text-sm mt-1 ${popular ? "text-neutral-600" : "text-neutral-500"}`}>{desc}</p>}
      <div className="mt-6 flex items-end gap-1">
        <span className="font-display text-5xl font-semibold tracking-tight">{price}</span>
        {period && <span className="text-neutral-500 mb-1.5">{period}</span>}
      </div>
      <ul className="mt-7 space-y-3 flex-1">
        {features.map((f) => (
          <li key={f} className={`flex items-start gap-2 text-sm font-light ${popular ? "text-neutral-700" : "text-neutral-300"}`}>
            <Check className={`w-4 h-4 mt-0.5 shrink-0 ${popular ? "text-black" : "text-white"}`} />{f}
          </li>
        ))}
      </ul>
      <Button
        data-testid={`pricing-card-cta-${name.toLowerCase()}`}
        onClick={onCtaClick}
        className={`mt-8 rounded-full h-11 font-semibold ${
          popular ? "bg-black text-white hover:bg-neutral-800" : "bg-white text-black hover:bg-neutral-200"
        }`}
      >
        {cta}
      </Button>
    </motion.div>
  );
}
