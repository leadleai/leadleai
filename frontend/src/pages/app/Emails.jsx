import { useState } from "react";
import { Sparkles, Send, Bold, Italic, List, Link2, Wand2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { emails } from "@/lib/mockData";
import { toast } from "sonner";

const tones = ["Professional", "Friendly", "Executive", "Startup", "Casual", "Formal"];
const subjects = ["Scaling {{company}}'s outbound in Q1", "A 60% faster ramp for {{company}}", "Quick idea for {{firstName}}"];

export default function Emails() {
  const [selected, setSelected] = useState(emails[0]);
  const [tone, setTone] = useState("Professional");
  const [body, setBody] = useState("Hi Sarah,\n\nI noticed Acme Robotics just closed a $40M Series B — congrats! As you scale outbound, ramp time is usually the bottleneck.\n\nLeadPilot AI cuts SDR ramp by 60% by researching accounts and writing personalized outreach automatically.\n\nWorth a quick 15-min look Thursday?\n\nBest,\nAlex");

  return (
    <div>
      <PageHeader title="AI Email Studio" subtitle="Write, personalize, and A/B test outreach at scale" testid="emails-header" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inbox */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden h-fit">
          <div className="px-4 h-12 flex items-center border-b border-slate-200 dark:border-slate-800 font-heading font-semibold">Inbox</div>
          {emails.map((e) => (
            <button key={e.id} onClick={() => setSelected(e)} data-testid={`email-item-${e.id}`}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 transition-all ${selected.id === e.id ? "bg-slate-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
              <div className="flex items-center justify-between"><span className={`text-sm ${e.unread ? "font-semibold" : "font-medium"}`}>{e.from}</span><span className="text-xs text-slate-400">{e.time}</span></div>
              <p className="text-sm text-slate-600 dark:text-slate-300 truncate mt-0.5">{e.subject}</p>
              <p className="text-xs text-slate-400 truncate">{e.preview}</p>
            </button>
          ))}
        </div>

        {/* Composer */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center gap-2 mb-4"><Wand2 className="w-4 h-4 text-indigo-600" /><span className="font-heading font-semibold">Generate personalized outreach</span></div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input data-testid="email-prompt" defaultValue="Personalize for Sarah Jenkins at Acme Robotics" className="rounded-xl flex-1" />
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger data-testid="tone-selector" className="w-full sm:w-40 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{tones.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Button data-testid="generate-email-btn" onClick={() => toast.success(`Generated ${tone.toLowerCase()} email`)} className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 shrink-0"><Sparkles className="w-4 h-4 mr-1" /> Generate</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">Subject line</label>
                <Select defaultValue={subjects[0]}>
                  <SelectTrigger data-testid="subject-selector" className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1 border-y border-slate-100 dark:border-slate-800 py-2">
                {[Bold, Italic, List, Link2].map((I, i) => <Button key={i} size="icon" variant="ghost" className="rounded-lg w-8 h-8" onClick={() => toast.info("Formatting applied")}><I className="w-4 h-4" /></Button>)}
                <Badge className="ml-auto rounded-full border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><ShieldCheck className="w-3 h-3 mr-1" /> Spam score: Low</Badge>
              </div>
              <Textarea data-testid="email-body" value={body} onChange={(e) => setBody(e.target.value)} className="rounded-xl min-h-48 font-mono text-sm" />
              <div className="flex items-center justify-between">
                <Button data-testid="schedule-email-btn" variant="outline" className="rounded-full" onClick={() => toast.success("Scheduled for 10 AM tomorrow")}>Schedule</Button>
                <Button data-testid="send-email-btn" onClick={() => toast.success("Email sent to Sarah Jenkins")} className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600"><Send className="w-4 h-4 mr-1" /> Send</Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <Tabs defaultValue="a">
              <div className="flex items-center justify-between mb-4">
                <span className="font-heading font-semibold">A/B Testing</span>
                <TabsList className="rounded-full"><TabsTrigger value="a" data-testid="ab-variant-a" className="rounded-full">Variant A</TabsTrigger><TabsTrigger value="b" data-testid="ab-variant-b" className="rounded-full">Variant B</TabsTrigger></TabsList>
              </div>
              <TabsContent value="a"><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-sm"><p className="font-medium">Subject: Scaling Acme&apos;s outbound in Q1</p><p className="text-slate-500 mt-1">Open rate: 64% · Reply: 16%</p></div></TabsContent>
              <TabsContent value="b"><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-sm"><p className="font-medium">Subject: A 60% faster ramp for Acme</p><p className="text-slate-500 mt-1">Open rate: 58% · Reply: 19%</p></div></TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
