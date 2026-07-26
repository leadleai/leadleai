import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";
import Logo from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { leadsApi, orgApi } from "@/lib/backend";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENQUIRY FORM — no login required.
// 👉 Point your Google Business Profile "Message"/contact button (and any other
//    inbound link) at:  https://<your-domain>/enquiry/<your-org-slug>
//    Each organization has its own slug (find it on the Team page), so leads
//    land in the right workspace. Bare /enquiry still works and falls back to
//    DEFAULT_ORG_SLUG in backend/.env.
//    The slug is a public form identifier, NOT a secret: it only lets someone
//    submit TO an org, never read anything FROM it.
// ─────────────────────────────────────────────────────────────────────────────

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const e164Re = /^\+[1-9]\d{7,14}$/;

export default function Enquiry() {
  const { slug } = useParams();
  const [form, setForm] = useState({ name: "", phone: "", email: "", company: "", enquiry: "" });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | done | error
  const [serverError, setServerError] = useState(null);
  const [orgName, setOrgName] = useState(null);

  // Show whose form this is (cosmetic — submission works regardless).
  useEffect(() => {
    if (!slug) return;
    let active = true;
    orgApi.publicOrg(slug)
      .then((o) => { if (active) setOrgName(o?.name || null); })
      .catch(() => { /* unknown slug surfaces on submit */ });
    return () => { active = false; };
  }, [slug]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const validate = () => {
    const err = {};
    if (!form.name.trim()) err.name = "Please enter your name";
    if (!form.phone.trim()) err.phone = "Phone is required";
    else if (!e164Re.test(form.phone.trim())) err.phone = "Use international format with country code, e.g. +919812345678";
    if (!form.email.trim()) err.email = "Email is required";
    else if (!emailRe.test(form.email.trim())) err.email = "Enter a valid email";
    if (!form.enquiry.trim()) err.enquiry = "Tell us how we can help";
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setStatus("submitting");
    setServerError(null);
    try {
      await leadsApi.create({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        company: form.company.trim() || null,
        enquiry: form.enquiry.trim(),
        org_slug: slug || null,   // null => backend uses DEFAULT_ORG_SLUG
      });
      setStatus("done");
    } catch (err) {
      setServerError(err.message);
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
          <h1 className="font-heading text-xl font-semibold mt-4">Thanks, {form.name.split(" ")[0]}!</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            We’ve received your enquiry and our team will reach out shortly.
          </p>
          <Link to="/"><Button variant="outline" className="mt-6 rounded-full">Back to site</Button></Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 sm:p-8">
        <Link to="/" className="flex items-center gap-2 mb-6">
          <Logo className="w-6 h-6" />
          <span className="font-heading font-bold">SaleScale AI</span>
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {orgName ? `Get in touch with ${orgName}` : "Get in touch"}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Tell us what you need and we’ll call you back.</p>

        <form onSubmit={submit} className="mt-6 space-y-4" data-testid="enquiry-form" noValidate>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input data-testid="enquiry-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your full name" className="rounded-xl" />
            {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input data-testid="enquiry-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98XXXXXXXX" className="rounded-xl" />
            {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input data-testid="enquiry-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" className="rounded-xl" />
            {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Company <span className="text-neutral-400 font-normal">(optional)</span></Label>
            <Input data-testid="enquiry-company" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>How can we help?</Label>
            <Textarea data-testid="enquiry-message" value={form.enquiry} onChange={(e) => set("enquiry", e.target.value)} placeholder="Describe your enquiry…" rows={4} className="rounded-xl" />
            {errors.enquiry && <p className="text-xs text-red-600">{errors.enquiry}</p>}
          </div>

          {serverError && <p className="text-sm text-red-600" data-testid="enquiry-server-error">{serverError}</p>}

          <Button data-testid="enquiry-submit" type="submit" disabled={status === "submitting"}
            className="w-full h-11 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            {status === "submitting" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : "Send enquiry"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
