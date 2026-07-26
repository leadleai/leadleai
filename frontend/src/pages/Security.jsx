import { useNavigate } from "react-router-dom";
import { ArrowRight, Shield, Lock, KeyRound, FileCheck, Server, Eye } from "lucide-react";
import MarketingPage from "@/components/marketing/MarketingPage";
import { Reveal, Magnetic } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";

const pillars = [
  { icon: Lock, t: "Encryption everywhere", d: "All data is encrypted in transit with TLS 1.2+ and at rest with AES-256. No exceptions." },
  { icon: FileCheck, t: "SOC 2 Type II", d: "Independently audited controls across security, availability, and confidentiality." },
  { icon: KeyRound, t: "SSO & RBAC", d: "Single sign-on and granular role-based access keep the right data in the right hands." },
  { icon: Server, t: "Isolated infrastructure", d: "Tenant data is logically isolated and hosted on hardened, continuously patched cloud infrastructure." },
  { icon: Eye, t: "Audit logging", d: "Every access and change is logged and reviewable, so nothing happens in the dark." },
  { icon: Shield, t: "Responsible AI", d: "Your data trains your instance only — never sold, never used to train models for anyone else." },
];

const certs = ["SOC 2 Type II", "GDPR", "CCPA", "TLS 1.2+", "AES-256"];

export default function Security() {
  const navigate = useNavigate();
  return (
    <MarketingPage
      kicker="Security"
      title="Enterprise-grade security by default."
      subtitle="SaleScale AI is built for teams that can't compromise on trust. Here's how we protect your data at every layer."
      testid="security-page"
    >
      {/* Cert chips */}
      <Reveal className="flex flex-wrap gap-3">
        {certs.map((c) => (
          <span key={c} className="rounded-full border border-white/15 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-neutral-300">{c}</span>
        ))}
      </Reveal>

      {/* Pillars */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-3xl overflow-hidden mt-10">
        {pillars.map((p, i) => (
          <Reveal key={p.t} delay={(i % 3) * 0.06} className="bg-black p-8 hover:bg-white/[0.03] transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <p.icon className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-semibold text-lg">{p.t}</h3>
            <p className="text-sm text-neutral-500 font-light mt-2.5 leading-relaxed">{p.d}</p>
          </Reveal>
        ))}
      </div>

      {/* Practices */}
      <div className="mt-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">Our practices</p>
        <div className="mt-6 space-y-px bg-white/10 border border-white/10 rounded-3xl overflow-hidden">
          {[
            { h: "Data ownership", p: "You own your data. Export or permanently delete it at any time — deletions are honored within 30 days." },
            { h: "Vendor management", p: "We work only with sub-processors under strict data processing agreements, reviewed regularly." },
            { h: "Vulnerability management", p: "Continuous monitoring, regular penetration testing, and a responsible disclosure program keep us ahead of threats." },
            { h: "Incident response", p: "A documented response plan and clear notification commitments mean you're never left guessing." },
          ].map((s, i) => (
            <Reveal key={s.h} delay={(i % 4) * 0.05} className="bg-black p-7 sm:p-9 hover:bg-white/[0.03] transition-colors group">
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-sm text-neutral-600 group-hover:text-white transition-colors">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-heading text-lg font-semibold">{s.h}</h3>
                  <p className="text-neutral-400 font-light leading-relaxed mt-2">{s.p}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Reveal delay={0.1} className="mt-20 rounded-3xl border border-white/10 bg-white/[0.02] p-10 sm:p-12 text-center">
        <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Need our security documentation?</h3>
        <p className="text-neutral-400 mt-3 font-light">We're happy to share our SOC 2 report, DPA, and answer your security review.</p>
        <Magnetic strength={0.3} className="inline-block mt-7">
          <Button onClick={() => navigate("/contact")} className="rounded-full bg-white text-black hover:bg-neutral-200 px-7 h-11 font-semibold">
            Contact security team <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Magnetic>
      </Reveal>
    </MarketingPage>
  );
}
