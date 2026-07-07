import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MapPin, Phone, Loader2, CheckCircle2 } from "lucide-react";
import MarketingPage from "@/components/marketing/MarketingPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!emailRe.test(form.email)) e.email = "Enter a valid email";
    if (!form.message.trim()) e.message = "Please tell us how we can help";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
      toast.success("Message sent! We'll be in touch within 24 hours.");
    }, 1200);
  };

  return (
    <MarketingPage title="Get in touch" subtitle="Questions about LeadPilot AI? Our team is here to help." testid="contact-page">
      <div className="grid md:grid-cols-3 gap-8 mt-4">
        <div className="space-y-6">
          {[
            { icon: Mail, label: "Email", value: "hello@leadpilot.ai" },
            { icon: Phone, label: "Phone", value: "+1 (415) 555-0100" },
            { icon: MapPin, label: "Office", value: "548 Market St, San Francisco, CA" },
          ].map((c) => (
            <div key={c.label} className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 shrink-0"><c.icon className="w-5 h-5" /></div>
              <div><p className="text-sm font-medium">{c.label}</p><p className="text-sm text-slate-500">{c.value}</p></div>
            </div>
          ))}
        </div>

        <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8">
          {sent ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8" data-testid="contact-success">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto"><CheckCircle2 className="w-8 h-8 text-emerald-500" /></div>
              <h3 className="font-heading text-xl font-bold mt-4">Message sent!</h3>
              <p className="text-slate-500 mt-2">Thanks {form.name.split(" ")[0]}, we&apos;ll get back to you within 24 hours.</p>
              <Button data-testid="contact-reset" variant="outline" className="mt-6 rounded-full" onClick={() => { setSent(false); setForm({ name: "", email: "", company: "", message: "" }); }}>Send another message</Button>
            </motion.div>
          ) : (
            <form onSubmit={submit} className="space-y-4" data-testid="contact-form" noValidate>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Full name</Label>
                  <Input data-testid="contact-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Alex Johnson" className={`rounded-xl h-11 ${errors.name ? "border-rose-400" : ""}`} />
                  {errors.name && <p className="text-xs text-rose-500" data-testid="contact-name-error">{errors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Work email</Label>
                  <Input data-testid="contact-email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" className={`rounded-xl h-11 ${errors.email ? "border-rose-400" : ""}`} />
                  {errors.email && <p className="text-xs text-rose-500" data-testid="contact-email-error">{errors.email}</p>}
                </div>
              </div>
              <div className="space-y-1.5"><Label>Company</Label><Input data-testid="contact-company" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Vertex Labs" className="rounded-xl h-11" /></div>
              <div className="space-y-1.5">
                <Label>How can we help?</Label>
                <Textarea data-testid="contact-message" value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Tell us about your team and goals..." className={`rounded-xl min-h-28 ${errors.message ? "border-rose-400" : ""}`} />
                {errors.message && <p className="text-xs text-rose-500" data-testid="contact-message-error">{errors.message}</p>}
              </div>
              <Button data-testid="contact-submit" type="submit" disabled={loading} className="w-full h-11 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</> : "Send message"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </MarketingPage>
  );
}
