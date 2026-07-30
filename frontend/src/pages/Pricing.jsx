import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingPage from "@/components/marketing/MarketingPage";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from "@/components/ui/accordion";
import PricingCard from "@/components/shared/PricingCard";
import { pricing, faqs } from "@/lib/mockData";
import { geoApi } from "@/lib/backend";
import {
  CURRENCY_OPTIONS, CURRENCIES, FALLBACK_CURRENCY,
  currencyForCountry, formatPlanPrice,
} from "@/lib/currency";

// Remember a manual override across visits, so a user who switches isn't
// re-corrected by geo detection every time.
const CURRENCY_KEY = "leadpilot.currency";

function CurrencySelector({ value, onChange }) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1"
      role="group"
      aria-label="Display currency"
      data-testid="currency-selector"
    >
      {CURRENCY_OPTIONS.map((code) => {
        const active = code === value;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={active}
            data-testid={`currency-option-${code}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-white text-black" : "text-neutral-400 hover:text-white"
            }`}
          >
            <span className="mr-1">{CURRENCIES[code].symbol}</span>
            {CURRENCIES[code].label}
          </button>
        );
      })}
    </div>
  );
}

export default function Pricing() {
  const navigate = useNavigate();
  const [currency, setCurrency] = useState(FALLBACK_CURRENCY);
  // True once the user has explicitly picked — pins the choice against detection.
  const [manual, setManual] = useState(false);

  // Restore a previous manual choice immediately (before detection runs).
  useEffect(() => {
    const saved = localStorage.getItem(CURRENCY_KEY);
    if (saved && CURRENCY_OPTIONS.includes(saved)) {
      setCurrency(saved);
      setManual(true);
    }
  }, []);

  // Detect visitor country → currency, unless they've already chosen manually.
  useEffect(() => {
    if (manual) return;
    let cancelled = false;
    (async () => {
      try {
        const { country_code } = await geoApi.detect();
        if (!cancelled && country_code) setCurrency(currencyForCountry(country_code));
      } catch {
        /* keep USD fallback */
      }
    })();
    return () => { cancelled = true; };
  }, [manual]);

  const chooseCurrency = (code) => {
    setCurrency(code);
    setManual(true);
    localStorage.setItem(CURRENCY_KEY, code);
  };

  return (
    <MarketingPage title="Simple, scalable pricing" subtitle="Start free. Upgrade as your pipeline grows. No hidden fees." testid="pricing-page">
      <div className="flex justify-center mb-10">
        <CurrencySelector value={currency} onChange={chooseCurrency} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {pricing.map((p, i) => {
          // Localized price when the plan has one; otherwise its original text
          // (e.g. Enterprise → "Custom"). Display only — billing is untouched.
          const localized = formatPlanPrice(p.name, currency);
          return (
            <PricingCard
              key={p.name}
              {...p}
              price={localized ?? p.price}
              index={i}
              onCtaClick={() => navigate(p.name === "Enterprise" ? "/contact" : "/signup")}
            />
          );
        })}
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
