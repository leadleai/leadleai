import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Building2, Package, Plug, Target, Check, ArrowRight, ArrowLeft,
  Upload, Chrome, Mail, Calendar, Cloud, Phone, Linkedin, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const steps = [
  { title: "Your company", icon: Building2 },
  { title: "Your product", icon: Package },
  { title: "Connect tools", icon: Plug },
  { title: "Your goals", icon: Target },
];

const tools = [
  { name: "Google Workspace", icon: Chrome }, { name: "Microsoft 365", icon: Building2 },
  { name: "Email", icon: Mail }, { name: "Calendar", icon: Calendar },
  { name: "CRM", icon: Cloud }, { name: "Phone", icon: Phone }, { name: "LinkedIn", icon: Linkedin },
];

const goals = [
  { name: "More meetings", desc: "Fill calendars with qualified prospects" },
  { name: "More replies", desc: "Boost engagement with personalization" },
  { name: "Outbound sales", desc: "Proactive prospecting at scale" },
  { name: "Inbound qualification", desc: "Auto-qualify incoming leads" },
  { name: "Customer support", desc: "Handle replies and follow-ups" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [connected, setConnected] = useState(["Google Workspace", "Email"]);
  const [selectedGoals, setSelectedGoals] = useState(["More meetings"]);

  const toggleTool = (n) => setConnected((c) => c.includes(n) ? c.filter(x => x !== n) : [...c, n]);
  const toggleGoal = (n) => setSelectedGoals((g) => g.includes(n) ? g.filter(x => x !== n) : [...g, n]);

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else { setDone(true); toast.success("Your AI sales employee is ready!"); }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-md" data-testid="onboarding-complete">
          <div className="w-20 h-20 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto text-white">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="font-heading text-3xl font-bold mt-6">You&apos;re all set!</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-3">LeadPilot AI is now scanning for leads, researching accounts, and preparing your first campaign.</p>
          <Button data-testid="go-to-dashboard" onClick={() => navigate("/app")} className="mt-8 rounded-full bg-white text-black hover:shadow-lg px-8 h-12">
            Go to Dashboard <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </motion.div>
      </div>
    );
  }

  const StepIcon = steps[step].icon;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col">
      <header className="h-16 flex items-center px-6 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center"><Zap className="w-5 h-5 text-white" fill="white" /></div>
          <span className="font-heading font-bold text-lg">LeadPilot AI</span>
        </div>
        <button onClick={() => navigate("/app")} data-testid="skip-onboarding" className="ml-auto text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white">Skip for now</button>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {/* Stepper */}
          <div className="flex items-center justify-between mb-10">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-2">
                  <div data-testid={`step-indicator-${i}`} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${i < step ? "bg-neutral-500 text-white" : i === step ? "bg-neutral-900 border border-neutral-800 text-white" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400"}`}>
                    {i < step ? <Check className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                  </div>
                  <span className="text-xs font-medium hidden sm:block text-neutral-500">{s.title}</span>
                </div>
                {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-2 ${i < step ? "bg-neutral-500" : "bg-neutral-200 dark:bg-neutral-800"}`} />}
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-neutral-50 dark:bg-neutral-500/10 flex items-center justify-center text-neutral-600"><StepIcon className="w-5 h-5" /></div>
              <h2 className="font-heading text-xl font-bold">{steps[step].title}</h2>
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} data-testid={`onboarding-step-${step}`}>
                {step === 0 && (
                  <div className="space-y-4">
                    <div className="space-y-2"><Label>Company name</Label><Input data-testid="ob-company" defaultValue="Vertex Labs" className="rounded-xl h-11" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Industry</Label><Input data-testid="ob-industry" defaultValue="B2B SaaS" className="rounded-xl h-11" /></div>
                      <div className="space-y-2"><Label>Website</Label><Input data-testid="ob-website" defaultValue="vertexlabs.io" className="rounded-xl h-11" /></div>
                    </div>
                    <div className="space-y-2"><Label>Logo</Label>
                      <div className="border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-xl p-6 flex flex-col items-center text-neutral-400 cursor-pointer hover:border-neutral-400 transition" data-testid="ob-logo-upload">
                        <Upload className="w-6 h-6 mb-2" /><span className="text-sm">Click to upload or drag & drop</span>
                      </div>
                    </div>
                  </div>
                )}
                {step === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2"><Label>Describe your product</Label><Textarea data-testid="ob-product" defaultValue="An AI-powered analytics platform that helps teams turn raw data into decisions." className="rounded-xl min-h-24" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Pricing</Label><Input data-testid="ob-pricing" defaultValue="$299/mo" className="rounded-xl h-11" /></div>
                      <div className="space-y-2"><Label>Competitors</Label><Input data-testid="ob-competitors" defaultValue="Looker, Mode" className="rounded-xl h-11" /></div>
                    </div>
                    <div className="space-y-2"><Label>Ideal customer</Label><Input data-testid="ob-icp" defaultValue="Data-driven teams at 100-1000 employee companies" className="rounded-xl h-11" /></div>
                    <div className="space-y-2"><Label>Pain points you solve</Label><Textarea data-testid="ob-pains" defaultValue="Slow reporting, siloed data, manual spreadsheets." className="rounded-xl min-h-20" /></div>
                  </div>
                )}
                {step === 2 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {tools.map((t) => {
                      const isOn = connected.includes(t.name);
                      return (
                        <button key={t.name} data-testid={`ob-tool-${t.name.toLowerCase().replace(/\s+/g,"-")}`} onClick={() => toggleTool(t.name)}
                          className={`rounded-xl border p-4 flex flex-col items-center gap-2 transition-all ${isOn ? "border-neutral-500 bg-neutral-50 dark:bg-neutral-500/10" : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300"}`}>
                          <t.icon className={`w-6 h-6 ${isOn ? "text-neutral-600" : "text-neutral-400"}`} />
                          <span className="text-xs font-medium text-center">{t.name}</span>
                          {isOn && <span className="text-[10px] text-neutral-600 font-semibold">Connected</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {step === 3 && (
                  <div className="space-y-3">
                    {goals.map((g) => {
                      const isOn = selectedGoals.includes(g.name);
                      return (
                        <button key={g.name} data-testid={`ob-goal-${g.name.toLowerCase().replace(/\s+/g,"-")}`} onClick={() => toggleGoal(g.name)}
                          className={`w-full text-left rounded-xl border p-4 flex items-center gap-3 transition-all ${isOn ? "border-neutral-500 bg-neutral-50 dark:bg-neutral-500/10" : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300"}`}>
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${isOn ? "bg-neutral-600 text-white" : "border border-neutral-300 dark:border-neutral-600"}`}>{isOn && <Check className="w-3.5 h-3.5" />}</div>
                          <div><p className="font-medium text-sm">{g.name}</p><p className="text-xs text-neutral-500">{g.desc}</p></div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between mt-8">
              <Button data-testid="ob-back" variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="rounded-full"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button data-testid="ob-next" onClick={next} className="rounded-full bg-white text-black hover:shadow-lg px-6">
                {step === steps.length - 1 ? "Complete setup" : "Continue"} <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
