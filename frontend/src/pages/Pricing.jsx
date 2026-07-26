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

      <div className="mt-24">
        <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-center">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-white/10">
              <AccordionTrigger className="text-left font-heading font-medium hover:no-underline py-5">{f.q}</AccordionTrigger>
              <AccordionContent className="text-neutral-400 font-light leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="mt-20 rounded-3xl bg-white text-black p-10 sm:p-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 bw-grid-light opacity-60" />
        <div className="relative">
          <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Need a custom plan?</h3>
          <p className="text-neutral-600 mt-3 font-light">Talk to our team about volume pricing and enterprise features.</p>
          <Button data-testid="pricing-page-contact-btn" onClick={() => navigate("/contact")} className="mt-7 rounded-full bg-black text-white hover:bg-neutral-800 px-7 h-11 font-semibold">
            Contact Sales <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </MarketingPage>
  );
}
