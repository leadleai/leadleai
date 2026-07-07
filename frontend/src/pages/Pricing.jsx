import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import MarketingPage from "@/components/marketing/MarketingPage";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from "@/components/ui/accordion";
import { pricing, faqs } from "@/lib/mockData";

export default function Pricing() {
  const navigate = useNavigate();
  return (
    <MarketingPage title="Simple, scalable pricing" subtitle="Start free. Upgrade as your pipeline grows. No hidden fees." testid="pricing-page">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {pricing.map((p, i) => (
          <motion.div key={p.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className={`rounded-2xl border p-7 flex flex-col ${p.popular ? "border-indigo-500 bg-white dark:bg-slate-900 shadow-2xl shadow-indigo-500/10 relative" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`}
            data-testid={`pricing-page-${p.name.toLowerCase()}`}>
            {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold px-3 py-1">Most Popular</span>}
            <h3 className="font-heading font-semibold text-lg">{p.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{p.desc}</p>
            <div className="mt-5 flex items-end gap-1"><span className="font-heading text-4xl font-bold">{p.price}</span><span className="text-slate-400 mb-1">{p.period}</span></div>
            <ul className="mt-6 space-y-3 flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><Check className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />{f}</li>
              ))}
            </ul>
            <Button data-testid={`pricing-page-cta-${p.name.toLowerCase()}`} onClick={() => navigate(p.name === "Enterprise" ? "/contact" : "/signup")}
              className={`mt-7 rounded-full ${p.popular ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg" : "bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-slate-800"}`}>
              {p.cta}
            </Button>
          </motion.div>
        ))}
      </div>

      <div className="mt-20">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-center">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="mt-8">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-slate-200 dark:border-slate-800">
              <AccordionTrigger className="text-left font-heading font-medium hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="text-slate-600 dark:text-slate-400 leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="mt-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 p-10 text-center text-white">
        <h3 className="font-heading text-2xl font-bold">Need a custom plan?</h3>
        <p className="text-white/80 mt-2">Talk to our team about volume pricing and enterprise features.</p>
        <Button data-testid="pricing-page-contact-btn" onClick={() => navigate("/contact")} className="mt-6 rounded-full bg-white text-indigo-700 hover:bg-white/90 px-7 h-11">
          Contact Sales <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </MarketingPage>
  );
}
