import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useSectionNav } from "./MarketingNav";

const columns = [
  { h: "Product", items: [
    { label: "Features", id: "features" },
    { label: "How it works", id: "workflow" },
    { label: "Pricing", to: "/pricing" },
    { label: "FAQ", id: "faq" },
  ]},
  { h: "Company", items: [
    { label: "About", to: "/contact" },
    { label: "Careers", to: "/contact" },
    { label: "Contact", to: "/contact" },
    { label: "Blog", to: "/contact" },
  ]},
  { h: "Legal", items: [
    { label: "Privacy Policy", to: "/privacy" },
    { label: "Terms of Service", to: "/terms" },
    { label: "Cookie Policy", to: "/cookies" },
    { label: "Security", to: "/privacy" },
  ]},
];

export default function MarketingFooter() {
  const navigate = useNavigate();
  const goToSection = useSectionNav();
  const handle = (item) => item.to ? navigate(item.to) : goToSection(item.id);

  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-900 py-12 bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 grid grid-cols-2 md:grid-cols-5 gap-8">
        <div className="col-span-2">
          <Link to="/" className="flex items-center gap-2.5" data-testid="footer-logo">
            <Plus className="w-6 h-6 text-foreground" strokeWidth={3} />
            <span className="font-heading font-bold">LeadPilot AI</span>
          </Link>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3 max-w-xs font-light">The autonomous AI sales employee that finds, researches, and closes — while you sleep.</p>
        </div>
        {columns.map((col) => (
          <div key={col.h}>
            <p className="font-semibold text-sm">{col.h}</p>
            <ul className="mt-3 space-y-2">
              {col.items.map((it) => (
                <li key={it.label}>
                  <button data-testid={`footer-link-${it.label.toLowerCase().replace(/\s+/g, "-")}`} onClick={() => handle(it)}
                    className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white transition text-left">{it.label}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="max-w-7xl mx-auto px-5 sm:px-8 mt-10 pt-6 border-t border-neutral-200 dark:border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-neutral-400">
        <span>© 2025 LeadPilot AI. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-black dark:hover:text-white transition">Privacy</Link>
          <Link to="/terms" className="hover:text-black dark:hover:text-white transition">Terms</Link>
          <Link to="/cookies" className="hover:text-black dark:hover:text-white transition">Cookies</Link>
        </div>
      </div>
    </footer>
  );
}
