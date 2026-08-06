import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus, Loader2, Bot, Star, Pencil, Trash2, Volume2, BookOpen, Zap,
} from "lucide-react";
import { PageHeader, EmptyState, ErrorState } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AgentEditor from "@/components/app/AgentEditor";
import { agentsApi } from "@/lib/backend";
import { toast } from "sonner";

// The org's AI calling agents. Create/edit/delete, and mark one as the default
// that auto-calls use. Voices are fetched once and shared with the editor.
export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [voices, setVoices] = useState([]);
  const [supportsPreview, setSupportsPreview] = useState(false);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | agent
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      const [list, voiceRes] = await Promise.all([
        agentsApi.list(),
        agentsApi.voices().catch(() => ({ voices: [] })),
      ]);
      setAgents(Array.isArray(list) ? list : []);
      setVoices(voiceRes?.voices || []);
      setSupportsPreview(!!voiceRes?.supports_preview);
      setState("ready");
    } catch (e) {
      setError(e.message); setState("error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (a) => { setEditing(a); setEditorOpen(true); };

  const onSaved = () => {
    // A save can flip the default flag on other rows, so reload for a consistent view.
    load();
  };

  const setDefault = async (a) => {
    try {
      await agentsApi.setDefault(a.id);
      toast.success(`${a.name} is now the default agent`);
      load();
    } catch (e) {
      toast.error("Couldn’t set default", { description: e.message });
    }
  };

  const remove = async (a) => {
    try {
      await agentsApi.remove(a.id);
      toast.success("Agent deleted");
      setAgents((xs) => xs.filter((x) => x.id !== a.id));
      load();
    } catch (e) {
      toast.error("Couldn’t delete agent", { description: e.message });
    }
  };

  const voiceName = (id) => voices.find((v) => v.id === id)?.name || id || "Default";

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="AI calling agents — their voice, script, and behaviour"
        testid="agents-header"
        action={
          <Button data-testid="agents-add-btn" onClick={openNew}
            className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            <Plus className="w-4 h-4 mr-1" /> New agent
          </Button>
        }
      />

      {state === "loading" && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] py-16 flex items-center justify-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading agents…
        </div>
      )}

      {state === "error" && (
        <ErrorState title="Couldn’t load agents" message={error} onRetry={load} testid="agents-error" />
      )}

      {state === "ready" && agents.length === 0 && (
        <EmptyState
          icon={Bot}
          title="No agents yet"
          desc="Create your first AI calling agent — give it a voice, a greeting, and a script. Your default agent handles auto-calls."
          action={
            <Button data-testid="agents-empty-add" onClick={openNew}
              className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              <Plus className="w-4 h-4 mr-1" /> New agent
            </Button>
          }
        />
      )}

      {state === "ready" && agents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="agents-list">
          {agents.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.03 * i, type: "spring", stiffness: 260, damping: 24 }}
              className={`rounded-2xl border bg-white dark:bg-white/[0.02] p-5 transition-colors ${
                a.is_default
                  ? "border-neutral-900 dark:border-white/40"
                  : "border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20"
              }`}
              data-testid={`agent-card-${a.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold truncate">{a.name}</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" /> {voiceName(a.voice)}
                      <span className="text-neutral-300 dark:text-neutral-600">·</span>
                      {a.language || "en"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {a.is_default && (
                    <Badge className="rounded-full border-0 bg-neutral-900 text-white dark:bg-white dark:text-black font-normal gap-1">
                      <Star className="w-3 h-3 fill-current" /> Default
                    </Badge>
                  )}
                  <Badge className={`rounded-full border-0 font-normal ${
                    a.is_active
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}>
                    {a.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300 line-clamp-2 min-h-[2.5rem]">
                {a.persona_prompt?.trim() || "No script yet — the agent uses a sensible default persona."}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.use_knowledge_base && (
                  <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 font-normal gap-1">
                    <BookOpen className="w-3 h-3" /> Knowledge base
                  </Badge>
                )}
                <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 font-normal gap-1">
                  <Zap className="w-3 h-3" /> temp {Number(a.temperature ?? 0.7).toFixed(2)}
                </Badge>
                <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 font-normal">
                  {a.max_duration ?? 5} min max
                </Badge>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-100 dark:border-white/5 pt-3">
                <div>
                  {!a.is_default && (
                    <Button size="sm" variant="ghost" data-testid={`agent-setdefault-${a.id}`}
                      className="rounded-full h-8 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                      onClick={() => setDefault(a)}>
                      <Star className="w-3.5 h-3.5 mr-1" /> Set default
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" data-testid={`agent-edit-${a.id}`}
                    className="rounded-full h-8" onClick={() => openEdit(a)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                  <DeleteAgentButton agent={a} onConfirm={() => remove(a)} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {editorOpen && (
        <AgentEditor
          key={editing?.id || "new"}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          agent={editing}
          voices={voices}
          supportsPreview={supportsPreview}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

// Two-step delete inline in the card footer.
function DeleteAgentButton({ agent, onConfirm }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirm) {
    return (
      <Button size="sm" variant="ghost" data-testid={`agent-delete-${agent.id}`}
        className="rounded-full h-8 text-neutral-500 hover:text-red-600 dark:hover:text-red-400"
        onClick={() => setConfirm(true)}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" className="rounded-full h-8" onClick={() => setConfirm(false)} disabled={busy}>
        Cancel
      </Button>
      <Button size="sm" data-testid={`agent-confirm-delete-${agent.id}`}
        className="rounded-full h-8 bg-red-600 text-white hover:bg-red-700"
        onClick={async () => { setBusy(true); await onConfirm(); }} disabled={busy}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Delete"}
      </Button>
    </div>
  );
}
