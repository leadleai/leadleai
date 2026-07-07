import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, FileType, Presentation, Video, Globe, Sparkles, Send, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { knowledgeDocs } from "@/lib/mockData";
import { toast } from "sonner";

const typeIcon = { PDF: FileText, Word: FileType, PowerPoint: Presentation, Video: Video, Website: Globe };
const statusColor = { Indexed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", Processing: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };

export default function KnowledgeBase() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState(null);

  const ask = () => {
    if (!q.trim()) return;
    setAnswer(`Based on your knowledge base: ${q.replace(/\?$/, "")} — our platform reduces SDR ramp time by 60% and integrates natively with Salesforce, HubSpot, and Google Workspace. Pricing starts at $99/mo.`);
    toast.success("AI answered from your knowledge base");
  };

  return (
    <div>
      <PageHeader title="AI Knowledge Base" subtitle="Upload docs and let AI answer anything about your business" testid="kb-header"
        action={<Button data-testid="kb-upload-btn" onClick={() => toast.success("Upload dialog opened")} className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg"><Upload className="w-4 h-4 mr-1" /> Upload</Button>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-8 flex flex-col items-center text-center cursor-pointer hover:border-indigo-400 transition" data-testid="kb-dropzone" onClick={() => toast.success("File picker opened")}>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 mb-3"><Upload className="w-6 h-6" /></div>
            <p className="font-medium">Drag & drop files here</p>
            <p className="text-sm text-slate-400 mt-1">PDF, Word, PowerPoint, Videos, or paste a website URL</p>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 h-12 flex items-center border-b border-slate-200 dark:border-slate-800 font-heading font-semibold">Documents</div>
            {knowledgeDocs.map((d) => {
              const Icon = typeIcon[d.type] || FileText;
              return (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0" data-testid={`kb-doc-${d.id}`}>
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{d.name}</p><p className="text-xs text-slate-400">{d.size} · {d.date}</p></div>
                  <Badge className={`rounded-full border-0 text-xs ${statusColor[d.status]}`}>{d.status}</Badge>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 h-fit">
          <div className="flex items-center gap-2 mb-4"><Sparkles className="w-4 h-4 text-indigo-600" /><h4 className="font-heading font-semibold">Ask AI anything</h4></div>
          <div className="flex gap-2">
            <Input data-testid="kb-ask-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="e.g. What's our pricing?" className="rounded-xl" />
            <Button data-testid="kb-ask-btn" onClick={ask} size="icon" className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 shrink-0"><Send className="w-4 h-4" /></Button>
          </div>
          {answer ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 p-4 text-sm text-slate-700 dark:text-slate-200" data-testid="kb-answer">{answer}</motion.div>
          ) : (
            <div className="mt-4 space-y-2">
              {["What's our pricing?", "Who are our competitors?", "What pain points do we solve?"].map((s) => (
                <button key={s} onClick={() => { setQ(s); }} className="w-full text-left text-sm rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition">{s}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
