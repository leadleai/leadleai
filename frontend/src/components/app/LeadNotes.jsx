import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Trash2, MessageSquarePlus, StickyNote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { notesApi } from "@/lib/backend";
import { toast } from "sonner";

const fmtDateTime = (v) => (v ? new Date(v).toLocaleString() : "—");
const initials = (email) => (email ? email[0].toUpperCase() : "?");

// Notes section for the lead detail page: a composer plus the lead's notes,
// newest first, each with its author + timestamp and a delete control. Adding
// or deleting a note is also reflected in the activity timeline, so the parent
// is told to refresh via onChanged.
export default function LeadNotes({ leadId, onChanged }) {
  const [notes, setNotes] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      const data = await notesApi.list(leadId);
      setNotes(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (e) {
      setError(e.message); setState("error");
    }
  }, [leadId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      const created = await notesApi.add(leadId, body);
      setNotes((ns) => [created, ...ns]);
      setDraft("");
      onChanged?.();
    } catch (e) {
      toast.error("Couldn’t add note", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    setDeletingId(id);
    try {
      await notesApi.remove(leadId, id);
      setNotes((ns) => ns.filter((n) => n.id !== id));
      onChanged?.();
    } catch (e) {
      toast.error("Couldn’t delete note", { description: e.message });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div data-testid="lead-notes">
      <h2 className="font-heading font-semibold text-lg mb-4">Notes</h2>

      <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }}
          rows={3}
          placeholder="Add a note about this lead…  (⌘/Ctrl + Enter to save)"
          data-testid="lead-note-input"
          className="rounded-xl text-sm"
          maxLength={10000}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            onClick={add}
            disabled={saving || !draft.trim()}
            data-testid="lead-note-save"
            className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</>
              : <><MessageSquarePlus className="w-4 h-4 mr-1" /> Add note</>}
          </Button>
        </div>
      </div>

      {state === "loading" && (
        <div className="mt-4 flex items-center justify-center gap-2 py-6 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading notes…
        </div>
      )}

      {state === "error" && (
        <div className="mt-4 rounded-xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-4 text-sm" data-testid="lead-notes-error">
          <p className="text-muted-foreground">{error}</p>
          <button onClick={load} className="mt-2 text-sm font-medium underline underline-offset-4">Try again</button>
        </div>
      )}

      {state === "ready" && notes.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-300 dark:border-white/10 py-8 text-center text-sm text-muted-foreground" data-testid="lead-notes-empty">
          <StickyNote className="w-5 h-5 mx-auto mb-2 text-neutral-400" />
          No notes yet.
        </div>
      )}

      {state === "ready" && notes.length > 0 && (
        <ul className="mt-4 space-y-3">
          {notes.map((n, i) => (
            <motion.li
              key={n.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04, type: "spring", stiffness: 260, damping: 24 }}
              className="group rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4"
              data-testid={`lead-note-${n.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black text-[11px] font-medium">
                    {initials(n.author_email)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-700 dark:text-neutral-200 truncate">{n.author_email || "Unknown"}</p>
                    <time className="text-[11px] text-muted-foreground">{fmtDateTime(n.created_at)}</time>
                  </div>
                </div>
                <button
                  onClick={() => remove(n.id)}
                  disabled={deletingId === n.id}
                  data-testid={`lead-note-delete-${n.id}`}
                  className="shrink-0 rounded-lg p-1.5 text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-all"
                  aria-label="Delete note"
                >
                  {deletingId === n.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">{n.body}</p>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
