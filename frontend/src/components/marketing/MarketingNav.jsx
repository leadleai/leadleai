import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Sun, Moon, Menu, Plus } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";

export const sectionLinks = [
  { label: "Features", id: "features" },
  { label: "How it works", id: "workflow" },
  { label: "Pricing", to: "/pricing" },
  { label: "FAQ", id: "faq" },
];

export function useSectionNav() {
  const navigate = useNavigate();
  const location = useLocation();
  return (id) => {
    if (location.pathname === "/") {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/", { state: { scrollTo: id } });
    }
  };
}

export default function MarketingNav() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const goToSection = useSectionNav();
  const [open, setOpen] = useState(false);

  const handleLink = (link) => {
    if (link.to) navigate(link.to);
    else goToSection(link.id);
    setOpen(false);
  };

  return (
    <header className="fixed top-0 w-full z-50 glass border-b border-black/10 dark:border-white/10">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5" data-testid="landing-logo">
          <Plus className="w-7 h-7 text-foreground" strokeWidth={3} />
          <span className="font-heading font-bold text-lg tracking-tight">LeadPilot AI</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
          {sectionLinks.map((l) => (
            <button key={l.label} data-testid={`nav-link-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => handleLink(l)} className="hover:text-slate-900 dark:hover:text-white transition">
              {l.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button data-testid="landing-theme-toggle" variant="ghost" size="icon" onClick={toggle} className="rounded-xl">
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
          <Button data-testid="nav-login-btn" variant="ghost" onClick={() => navigate("/login")} className="rounded-full hidden sm:inline-flex">Log in</Button>
          <Button data-testid="nav-signup-btn" onClick={() => navigate("/signup")} className="rounded-full bg-white text-black hover:bg-neutral-200 dark:bg-white dark:text-black font-medium">Start Free Trial</Button>

          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button data-testid="landing-mobile-menu" variant="ghost" size="icon" className="rounded-xl md:hidden"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader><SheetTitle className="text-left font-heading">Menu</SheetTitle></SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                {sectionLinks.map((l) => (
                  <button key={l.label} data-testid={`mobile-nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => handleLink(l)} className="text-left rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    {l.label}
                  </button>
                ))}
                <SheetClose asChild>
                  <Button onClick={() => navigate("/login")} variant="outline" className="rounded-full mt-4">Log in</Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button onClick={() => navigate("/signup")} className="rounded-full bg-white text-black hover:bg-neutral-200">Start Free Trial</Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
