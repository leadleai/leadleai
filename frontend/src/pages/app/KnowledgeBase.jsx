import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus, Loader2, AlertTriangle, BookOpen, Save, Trash2, Sparkles, X, Tag, FlaskConical, Target,
} from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { knowledgeApi, parseKeywords, keywordsToText } from "@/lib/backend";
import { toast } from "sonner";

// The knowledge base an org uploads once and edits: plain-text entries (product
// facts, pricing, FAQs, policies), each with keywords. When a lead's enquiry
// contains an entry's keywords, that entry's content is dropped into the
// follow-up email — rule-based matching, no AI.
export default function KnowledgeBase() {
  const [entries, setEntries] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      const data = await knowledgeApi.list();
      setEntries(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (e) {
      setError(e.message); setState("error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onCreated = (entry) => { setEntries((es) => [entry, ...es]); setAdding(false); };
  const onUpdated = (entry) =>
    setEntries((es) => es.map((e) => (e.id === entry.id ? entry : e)));
  const onDeleted = (id) => setEntries((es) => es.filter((e) => e.id !== id));

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        subtitle="Keyword-matched answers that fill your follow-up emails"
        testid="kb-header"
        action={
          <Button data-testid="kb-add-btn" onClick={() => setAdding(true)} disabled={adding}
            className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            <Plus className="w-4 h-4 mr-1" /> Add entry
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-neutral-500/5 p-4 flex items-start gap-3"
            data-testid="kb-note">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-neutral-800 flex items-center justify-center shrink-0 border border-neutral-200 dark:border-neutral-700">
              <Target className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Each entry's <strong>keywords</strong> are matched against the lead's enquiry. On a match,
              the entry's content is inserted into the follow-up email. If nothing matches, the plain
              template is sent. Use the <strong>Test match</strong> tool to tune keywords before sending.
            </p>
          </div>

          {adding && (
            <EntryCard mode="new" onCreated={onCreated} onCancel={() => setAdding(false)} />
          )}

          {state === "loading" && (
            <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-16 flex items-center justify-center gap-2 text-sm text-neutral-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading knowledge base…
            </div>
          )}

          {state === "error" && (
            <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm" data-testid="kb-error">
              <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                <AlertTriangle className="w-4 h-4" /> Couldn’t load the knowledge base
              </div>
              <p className="mt-1 text-muted-foreground">{error}</p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
            </div>
          )}

          {state === "ready" && entries.length === 0 && !adding && (
            <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/10 bg-white dark:bg-white/[0.02] py-16 flex flex-col items-center text-center px-6" data-testid="kb-empty">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6 text-neutral-500" />
              </div>
              <h3 className="font-heading font-semibold text-lg">No knowledge base yet</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm">
                Add your first entry with keywords so follow-ups can answer enquiries automatically.
              </p>
              <Button data-testid="kb-empty-add" onClick={() => setAdding(true)}
                className="mt-4 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                <Plus className="w-4 h-4 mr-1" /> Add entry
              </Button>
            </div>
          )}

          {state === "ready" && entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onUpdated={onUpdated} onDeleted={onDeleted} />
          ))}
        </div>

        <TestMatchPanel entries={entries} />
      </div>
    </div>
  );
}

// One editable entry: title (optional), content, and comma-separated keywords.
function EntryCard({ entry, mode, onCreated, onUpdated, onCancel, onDeleted }) {
  const isNew = mode === "new";
  const [title, setTitle] = useState(entry?.title || "");
  const [content, setContent] = useState(entry?.content || "");
  const [keywords, setKeywords] = useState(keywordsToText(entry?.keywords));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const kwList = parseKeywords(keywords);
  const origKw = keywordsToText(entry?.keywords);
  const dirty = isNew
    ? content.trim().length > 0 || title.trim().length > 0 || keywords.trim().length > 0
    : title !== (entry.title || "") || content !== (entry.content || "") || keywords !== origKw;
  const canSave = content.trim().length > 0 && dirty && !saving;

  const save = async () => {
    setSaving(true);
    const payload = { title: title.trim(), content: content.trim(), keywords: kwList };
    try {
      if (isNew) {
        const created = await knowledgeApi.create(payload);
        toast.success("Entry added", { description: "Follow-ups can now match it." });
        onCreated?.(created);
      } else {
        const updated = await knowledgeApi.update(entry.id, payload);
        toast.success("Entry saved");
        onUpdated?.(updated);
      }
    } catch (e) {
      toast.error(isNew ? "Couldn’t add entry" : "Couldn’t save entry", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await knowledgeApi.remove(entry.id);
      toast.success("Entry deleted");
      onDeleted?.(entry.id);
    } catch (e) {
      toast.error("Couldn’t delete entry", { description: e.message });
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 space-y-3"
      data-testid={isNew ? "kb-new-card" : `kb-card-${entry.id}`}>
      <div className="space-y-1.5">
        <Label>Title <span className="text-neutral-400 font-normal">(optional)</span></Label>
        <Input data-testid="kb-title" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Pricing, Integrations, Onboarding…" className="rounded-xl" maxLength={200} />
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Keywords</Label>
        <Input data-testid="kb-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)}
          placeholder="price, pricing, cost, how much" className="rounded-xl" />
        <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
          <span>Comma-separated. Matched against the enquiry, case-insensitive, whole-word.</span>
          <span data-testid="kb-kwcount" className="shrink-0">{kwList.length} keyword{kwList.length === 1 ? "" : "s"}</span>
        </div>
        {kwList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {kwList.map((k) => (
              <Badge key={k} className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 font-normal">{k}</Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Content <span className="text-neutral-400 font-normal">(inserted into the email on a match)</span></Label>
        <Textarea data-testid="kb-content" value={content} rows={7}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Plain text the email will quote — pricing tiers, what you do, answers to common questions, policies…"
          className="rounded-xl text-sm leading-relaxed" />
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span data-testid="kb-charcount">{content.length.toLocaleString()} characters</span>
          {!isNew && entry.updated_at && (
            <span>Updated {new Date(entry.updated_at).toLocaleString()}</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          {!isNew && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">Delete this entry?</span>
                <Button size="sm" variant="ghost" className="rounded-full h-8"
                  onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
                <Button size="sm" className="rounded-full h-8 bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                  data-testid="kb-confirm-delete" onClick={remove} disabled={deleting}>
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Delete"}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" data-testid={`kb-delete-${entry.id}`}
                className="rounded-full h-8 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          {isNew && (
            <Button size="sm" variant="outline" className="rounded-full" onClick={onCancel} disabled={saving}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          )}
          <Button size="sm" data-testid="kb-save" onClick={save} disabled={!canSave}
            className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            {saving
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4 mr-1" /> {isNew ? "Add entry" : "Save"}</>}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// Type a sample enquiry, see which entry would match — same matcher the drip uses.
function TestMatchPanel({ entries }) {
  const [enquiry, setEnquiry] = useState("");
  const [result, setResult] = useState(null); // null | {matched, ...}
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!enquiry.trim()) return;
    setBusy(true); setResult(null);
    try {
      setResult(await knowledgeApi.testMatch(enquiry.trim()));
    } catch (e) {
      toast.error("Couldn’t test match", { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const matchedTitle = result?.matched
    ? (entries.find((e) => e.id === result.entry_id)?.title || result.title) : null;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 h-fit lg:sticky lg:top-4"
      data-testid="kb-testmatch">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-4 h-4 text-neutral-600" />
        <h4 className="font-heading font-semibold">Test match</h4>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
        Paste a sample enquiry to see which entry a follow-up would use. Nothing is sent.
      </p>
      <Textarea data-testid="kb-testmatch-input" value={enquiry} rows={4}
        onChange={(e) => setEnquiry(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
        placeholder="e.g. How much does the pro plan cost?" className="rounded-xl text-sm" />
      <Button data-testid="kb-testmatch-btn" onClick={run} disabled={busy || !enquiry.trim()}
        className="mt-2 w-full rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
        {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Matching…</> : <><Target className="w-4 h-4 mr-1" /> Test match</>}
      </Button>

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4"
          data-testid="kb-testmatch-result">
          {result.matched ? (
            <div className="rounded-xl border border-neutral-900 dark:border-white/40 bg-neutral-50 dark:bg-white/[0.04] p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
                <Target className="w-4 h-4" /> Matches: {matchedTitle || "(untitled)"}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.matched_keywords.map((k) => (
                  <Badge key={k} className="rounded-full border-0 bg-neutral-900 text-white dark:bg-white dark:text-black font-normal">{k}</Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Score {result.score} — this entry's content will fill the email.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] p-3 text-sm text-neutral-600 dark:text-neutral-300">
              No entry matched — the follow-up would use the plain template. Try adding keywords from this enquiry to an entry.
            </div>
          )}
          {result.enabled === false && (
            <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> KB matching is off (KB_MATCHING_ENABLED=false) — emails send plain templates.
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
