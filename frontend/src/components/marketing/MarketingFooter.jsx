import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import Logo from "@/components/shared/Logo";
import { Marquee, Reveal } from "./motion";

// Every footer link now points at its own dedicated route.
const columns = [
  { h: "Product", items: [
    { label: "Features", to: "/features" },
    { label: "How it works", to: "/how-it-works" },
    { label: "Pricing", to: "/pricing" },
    { label: "FAQ", to: "/faq" },
  ]},
  { h: "Company", items: [
    { label: "About", to: "/about" },
    { label: "Careers", to: "/careers" },
    { label: "Contact", to: "/contact" },
    { label: "Blog", to: "/blog" },
  ]},
  { h: "Legal", items: [
    { label: "Privacy Policy", to: "/privacy" },
    { label: "Terms of Service", to: "/terms" },
    { label: "Cookie Policy", to: "/cookies" },
    { label: "Security", to: "/security" },
  ]},
];

export default function MarketingFooter() {
  return (
    <footer className="relative bg-black text-white border-t border-white/10 overflow-hidden">
      <div className="bw-noise absolute inset-0 opacity-[0.05] pointer-events-none" />

      {/* Giant marquee wordmark */}
      <div className="relative border-b border-white/10 py-8 select-none">
        <Marquee duration={40}>
          <span className="font-display text-[16vw] leading-none font-semibold tracking-tighter px-8 bw-outline-text">
            SALESCALE&nbsp;AI —
          </span>
        </Marquee>
      </div>

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-16 pb-10 grid grid-cols-2 md:grid-cols-5 gap-10">
        <div className="col-span-2">
          <Link to="/" className="flex items-center gap-2.5 group" data-testid="footer-logo">
            <Logo className="w-7 h-7 text-white transition-transform duration-500 group-hover:rotate-[360deg]" />
            <span className="font-heading font-bold text-lg uppercase tracking-tight">SaleScale AI</span>
          </Link>
          <p className="text-sm text-neutral-400 mt-4 max-w-xs font-light leading-relaxed">
            The autonomous AI sales employee that finds, researches, and closes — while you sleep.
          </p>
          <Link
            to="/enquiry"
            className="group inline-flex items-center gap-1.5 mt-6 text-sm font-medium uppercase tracking-widest border-b border-white/30 pb-1 hover:border-white transition-colors"
          >
            Get in touch
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        {columns.map((col, ci) => (
          <Reveal key={col.h} delay={ci * 0.08}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">{col.h}</p>
            <ul className="mt-4 space-y-2.5">
              {col.items.map((it) => (
                <li key={it.label}>
                  <Link
                    to={it.to}
                    data-testid={`footer-link-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
                    className="text-sm text-neutral-400 hover:text-white transition-colors bw-underline"
                  >
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs uppercase tracking-widest text-neutral-500">
        <span>© 2025 SaleScale AI. All rights reserved.</span>
        <div className="flex items-center gap-6">
          <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
          <Link to="/cookies" className="hover:text-white transition-colors">Cookies</Link>
        </div>
      </div>
    </footer>
  );
}
