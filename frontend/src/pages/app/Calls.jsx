import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Phone, PhoneCall, Mic, PhoneOff, Play } from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calls, transcript } from "@/lib/mockData";
import { toast } from "sonner";

const sentimentColor = { Positive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", Neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", Negative: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" };

function Waveform({ active }) {
  return (
    <div className="flex items-center justify-center gap-1 h-16">
      {[...Array(28)].map((_, i) => (
        <motion.div key={i} className="w-1 rounded-full bg-white/80"
          animate={active ? { height: [8, 12 + (i % 5) * 8, 8] } : { height: 6 }}
          transition={{ duration: 0.6 + (i % 4) * 0.15, repeat: Infinity, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

export default function Calls() {
  const [live, setLive] = useState(true);
  const [visible, setVisible] = useState(2);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setVisible((v) => Math.min(v + 1, transcript.length)), 2200);
    return () => clearInterval(t);
  }, [live]);

  return (
    <div>
      <PageHeader title="AI Phone Agent" subtitle="Autonomous voice calls with real-time transcription & sentiment" testid="calls-header"
        action={<Select defaultValue="Ava"><SelectTrigger data-testid="voice-selector" className="w-40 rounded-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Ava">Voice: Ava</SelectItem><SelectItem value="Leo">Voice: Leo</SelectItem><SelectItem value="Mia">Voice: Mia</SelectItem></SelectContent></Select>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 p-6 text-white relative overflow-hidden" data-testid="live-call-panel">
            <div className="absolute inset-0 grain opacity-20" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center"><PhoneCall className="w-5 h-5" /></div>
                  <div><p className="font-heading font-semibold">James Wilson · Contoso Cloud</p><p className="text-white/70 text-sm flex items-center gap-1.5">{live && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}{live ? "Live · 02:14" : "Call ended"}</p></div>
                </div>
                <Badge className="rounded-full bg-white/20 border-0 text-white">Qualifying</Badge>
              </div>
              <Waveform active={live} />
              <div className="flex items-center justify-center gap-3">
                <Button size="icon" variant="ghost" className="rounded-full bg-white/20 hover:bg-white/30 text-white w-12 h-12" onClick={() => toast.info("Muted")}><Mic className="w-5 h-5" /></Button>
                <Button data-testid="end-call-btn" size="icon" className="rounded-full bg-rose-500 hover:bg-rose-600 w-14 h-14" onClick={() => { setLive(false); toast.success("Call ended · Meeting booked"); }}><PhoneOff className="w-6 h-6" /></Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h4 className="font-heading font-semibold mb-4">Live Transcript</h4>
            <div className="space-y-3">
              {transcript.slice(0, visible).map((t, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${t.speaker === "AI" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${t.speaker === "AI" ? "bg-indigo-50 dark:bg-indigo-500/10 text-slate-700 dark:text-slate-200" : "bg-slate-100 dark:bg-slate-800"}`}>
                    <span className="text-[10px] font-semibold text-slate-400 block">{t.speaker}</span>{t.text}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h4 className="font-heading font-semibold mb-4">Live Analysis</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Sentiment</span><Badge className="rounded-full border-0 bg-emerald-100 text-emerald-700">Positive</Badge></div>
              <div className="flex justify-between items-center"><span className="text-slate-500">Qualification</span><div className="flex items-center gap-2"><span className="font-semibold">82</span><div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 w-[82%]" /></div></div></div>
              <div className="flex justify-between"><span className="text-slate-500">Objection detected</span><span className="font-medium">Pricing</span></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h4 className="font-heading font-semibold mb-4">Call History</h4>
            <div className="space-y-2">
              {calls.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0" data-testid={`call-history-${c.id}`}>
                  <Button size="icon" variant="ghost" className="rounded-lg w-8 h-8 shrink-0" onClick={() => toast.info(`Playing recording · ${c.contact}`)}><Play className="w-4 h-4" /></Button>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{c.contact}</p><p className="text-xs text-slate-400">{c.company} · {c.duration}</p></div>
                  <Badge className={`rounded-full border-0 text-xs ${sentimentColor[c.sentiment]}`}>{c.sentiment}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
