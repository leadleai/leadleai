import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingPage from "@/components/marketing/MarketingPage";
import { Reveal, Magnetic } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from "@/components/ui/accordion";
import { faqs } from "@/lib/mockData";

export default function FAQ() {
  const navigate = useNavigate();
  return (
    <MarketingPage
      kicker="FAQ"
      title="Frequently asked questions."
      subtitle="Everything you need to know about the autonomous AI sales employee. Can't find an answer? Talk to our team."
      testid="faq-page"
    >
      <Accordion type="single" collapsible data-testid="faq-page-accordion">
        {faqs.map((f, i) => (
          <Reveal key={i} delay={(i % 5) * 0.04}>
            <AccordionItem value={`item-${i}`} className="border-white/10">
              <AccordionTrigger className="text-left font-heading font-medium hover:no-underline py-5 text-base" data-testid={`faq-page-trigger-${i}`}>
                <span className="flex items-baseline gap-4">
                  <span className="font-mono text-sm text-neutral-600">{String(i + 1).padStart(2, "0")}</span>
                  {f.q}
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-neutral-400 font-light leading-relaxed pl-10">{f.a}</AccordionContent>
            </AccordionItem>
          </Reveal>
        ))}
      </Accordion>

      <Reveal delay={0.1} className="mt-16 rounded-3xl border border-white/10 bg-white/[0.02] p-10 sm:p-12 text-center">
        <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Still have questions?</h3>
        <p className="text-neutral-400 mt-3 font-light">Our team is happy to walk you through everything.</p>
        <Magnetic strength={0.3} className="inline-block mt-7">
          <Button data-testid="faq-contact-btn" onClick={() => navigate("/contact")} className="rounded-full bg-white text-black hover:bg-neutral-200 px-7 h-11 font-semibold">
            Contact us <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Magnetic>
      </Reveal>
    </MarketingPage>
  );
}
