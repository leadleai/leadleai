import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Logo from "@/components/shared/Logo";
import { Magnetic } from "./motion";

// Every marketing nav link now resolves to its own dedicated route.
export const sectionLinks = [
  { label: "Features", to: "/features" },
  { label: "How it works", to: "/how-it-works" },
  { label: "Pricing", to: "/pricing" },
  { label: "FAQ", to: "/faq" },
];

// Kept for backwards compatibility with any page that still imports it:
// on the landing page it smooth-scrolls to a section, otherwise it routes home.
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
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const isActive = (to) => location.pathname === to;

  return (
    <>
      <motion.header
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed top-0 w-full z-50 transition-colors duration-300 ${
          scrolled ? "bg-black/70 backdrop-blur-xl border-b border-white/10" : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between text-white">
          <Link to="/" className="flex items-center gap-2.5 group" data-testid="landing-logo">
            <Logo className="w-7 h-7 text-white transition-transform duration-500 group-hover:rotate-[360deg]" />
            <span className="font-heading font-bold text-lg tracking-tight uppercase">SaleScale AI</span>
          </Link>

          <nav className="hidden md:flex items-center gap-9 text-[13px] font-medium uppercase tracking-widest text-neutral-400">
            {sectionLinks.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                data-testid={`nav-link-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`bw-underline transition-colors hover:text-white ${isActive(l.to) ? "text-white" : ""}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              data-testid="nav-contact-btn"
              onClick={() => navigate("/enquiry")}
              className="hidden lg:inline-flex text-[13px] font-medium uppercase tracking-widest text-neutral-400 hover:text-white transition-colors px-3 py-2 bw-underline"
            >
              Get in touch
            </button>
            <button
              data-testid="nav-login-btn"
              onClick={() => navigate("/login")}
              className="hidden sm:inline-flex text-[13px] font-medium uppercase tracking-widest text-neutral-400 hover:text-white transition-colors px-3 py-2 bw-underline"
            >
              Log in
            </button>
            <Magnetic strength={0.4} className="hidden sm:block">
              <button
                data-testid="nav-signup-btn"
                onClick={() => navigate("/signup")}
                className="group inline-flex items-center gap-1.5 rounded-full bg-white text-black font-semibold text-sm px-5 h-10 hover:bg-neutral-200 transition-colors"
              >
                Start Free Trial
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </Magnetic>

            <button
              data-testid="landing-mobile-menu"
              onClick={() => setOpen(true)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/15 text-white hover:bg-white/10 transition"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Fullscreen mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-[60] bg-black text-white md:hidden"
            data-testid="mobile-menu-overlay"
          >
            <div className="bw-noise absolute inset-0 opacity-[0.06] pointer-events-none" />
            <div className="relative flex items-center justify-between px-5 h-16 border-b border-white/10">
              <span className="font-heading font-bold text-lg tracking-tight uppercase">SaleScale AI</span>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-white/15 hover:bg-white/10 transition"
                aria-label="Close menu"
                data-testid="mobile-menu-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="relative px-5 py-8 flex flex-col">
              {sectionLinks.map((l, i) => (
                <motion.div
                  key={l.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06 }}
                >
                  <Link
                    to={l.to}
                    data-testid={`mobile-nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                    className="block font-display text-4xl font-semibold tracking-tight py-3 border-b border-white/10 hover:pl-3 transition-all"
                  >
                    {l.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-8 flex flex-col gap-3">
                <button
                  data-testid="mobile-nav-contact-btn"
                  onClick={() => navigate("/enquiry")}
                  className="rounded-full border border-white/20 h-12 font-medium uppercase tracking-widest text-sm hover:bg-white/10 transition"
                >
                  Get in touch
                </button>
                <button
                  onClick={() => navigate("/login")}
                  className="rounded-full border border-white/20 h-12 font-medium uppercase tracking-widest text-sm hover:bg-white/10 transition"
                >
                  Log in
                </button>
                <button
                  data-testid="mobile-nav-signup-btn"
                  onClick={() => navigate("/signup")}
                  className="rounded-full bg-white text-black h-12 font-semibold uppercase tracking-widest text-sm hover:bg-neutral-200 transition"
                >
                  Start Free Trial
                </button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
