import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingPage from "@/components/marketing/MarketingPage";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from "@/components/ui/accordion";
import PricingCard from "@/components/shared/PricingCard";
import { pricing, faqs } from "@/lib/mockData";

export default function Pricing() {
  const navigate = useNavigate();
  return (
    <MarketingPage title="Simple, scalable pricing" subtitle="Start free. Upgrade as your pipeline grows. No hidden fees." testid="pricing-page">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {pricing.map((p, i) => (
          <PricingCard key={p.name} {...p} index={i} onCtaClick={() => navigate(p.name === "Enterprise" ? "/contact" : "/signup")} />
        ))}
      </div>

      <div className="mt-20">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-center">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="mt-8">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-neutral-200 dark:border-neutral-800">
              <AccordionTrigger className="text-left font-heading font-medium hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="text-neutral-600 dark:text-neutral-400 leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="mt-16 rounded-2xl bg-neutral-900 border border-neutral-800 p-10 text-center text-white">
        <h3 className="font-heading text-2xl font-bold">Need a custom plan?</h3>
        <p className="text-white/80 mt-2">Talk to our team about volume pricing and enterprise features.</p>
        <Button data-testid="pricing-page-contact-btn" onClick={() => navigate("/contact")} className="mt-6 rounded-full bg-white text-neutral-700 hover:bg-white/90 px-7 h-11">
          Contact Sales <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </MarketingPage>
  );
}
