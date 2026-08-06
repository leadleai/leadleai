import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, Sparkles, BookOpen, ChevronDown, Wand2, Play, Square } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { agentsApi, AGENT_LANGUAGES } from "@/lib/backend";
import { toast } from "sonner";

// Create / edit one AI calling agent. All the Bland-relevant knobs an org can
// tune live here; save goes through the org-scoped CRUD. `voices` is the real
// provider voice list fetched once by the parent.
export default function AgentEditor({ open, onOpenChange, agent, voices, supportsPreview, onSaved }) {
  const isNew = !agent;
  const [name, setName] = useState(agent?.name || "");
  const [voice, setVoice] = useState(agent?.voice || (voices[0]?.id ?? ""));
  const [language, setLanguage] = useState(agent?.language || "en");
  const [firstMessage, setFirstMessage] = useState(agent?.first_message || "");
  const [persona, setPersona] = useState(agent?.persona_prompt || "");
  const [useKb, setUseKb] = useState(!!agent?.use_knowledge_base);
  const [temperature, setTemperature] = useState(
    agent?.temperature != null ? Number(agent.temperature) : 0.7
  );
  const [maxDuration, setMaxDuration] = useState(agent?.max_duration ?? 5);
  const [isActive, setIsActive] = useState(agent?.is_active ?? true);
  const [isDefault, setIsDefault] = useState(!!agent?.is_default);
  const [extra, setExtra] = useState(
    agent?.extra_params && Object.keys(agent.extra_params).length
      ? JSON.stringify(agent.extra_params, null, 2)
      : ""
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const voiceLabel = useMemo(
    () => (id) => voices.find((v) => v.id === id)?.name || id,
    [voices]
  );

  const save = async () => {
    if (!name.trim()) {
      toast.error("Give your agent a name");
      return;
    }
    let extra_params = {};
    if (extra.trim()) {
      try {
        extra_params = JSON.parse(extra);
        if (typeof extra_params !== "object" || Array.isArray(extra_params)) {
          throw new Error("must be a JSON object");
        }
      } catch (e) {
        toast.error("Advanced params must be valid JSON", { description: e.message });
        return;
      }
    }

    const payload = {
      name: name.trim(),
      voice: voice || null,
      language,
      first_message: firstMessage,
      persona_prompt: persona,
      use_knowledge_base: useKb,
      temperature: Number(temperature),
      max_duration: Number(maxDuration) || 5,
      extra_params,
      is_active: isActive,
      is_default: isDefault,
    };

    setSaving(true);
    try {
      const saved = isNew
        ? await agentsApi.create(payload)
        : await agentsApi.update(agent.id, payload);
      toast.success(isNew ? "Agent created" : "Agent saved");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toast.error(isNew ? "Couldn’t create agent" : "Couldn’t save agent", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl" data-testid="agent-editor">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Sparkles className="w-5 h-5" /> {isNew ? "New calling agent" : "Edit agent"}
          </DialogTitle>
          <DialogDescription>
            Design how this AI voice agent introduces itself and speaks on calls. Powered by Bland.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input data-testid="agent-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ava — Inbound qualifier" className="rounded-xl" maxLength={80} />
          </div>

          {/* Voice + language */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Voice</Label>
              <div className="flex items-center gap-2">
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger data-testid="agent-voice" className="rounded-xl flex-1 min-w-0">
                    <SelectValue placeholder="Pick a voice">{voiceLabel(voice)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {voices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        <span className="font-medium">{v.name}</span>
                        {v.description ? <span className="text-neutral-400"> — {v.description}</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {supportsPreview && <VoicePreview voiceId={voice} />}
              </div>
              {supportsPreview && (
                <p className="text-xs text-neutral-400">Press play to hear a real sample of the selected voice.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger data-testid="agent-language" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Greeting / first message */}
          <div className="space-y-1.5">
            <Label>Greeting <span className="text-neutral-400 font-normal">(the opening line)</span></Label>
            <Textarea data-testid="agent-greeting" value={firstMessage} rows={2}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="Hi {name}, this is Ava from SaleScale — is now a good time?"
              className="rounded-xl text-sm" maxLength={2000} />
          </div>

          {/* Persona / script */}
          <div className="space-y-1.5">
            <Label>Persona & script</Label>
            <Textarea data-testid="agent-persona" value={persona} rows={7}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Describe the agent's personality, goal, and how to handle the call. e.g. You are a warm, concise sales rep. Qualify the lead's budget and timeline, then offer a demo…"
              className="rounded-xl text-sm leading-relaxed" maxLength={20000} />
            <p className="text-xs text-neutral-400">
              This becomes the call's instructions. Lead name, company, and their enquiry are added automatically.
            </p>
          </div>

          {/* Knowledge base toggle */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 dark:border-white/10 p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
              </div>
              <div>
                <p className="text-sm font-medium">Use knowledge base</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Ground answers in your Knowledge Base so the agent only states facts you’ve added.
                </p>
              </div>
            </div>
            <Switch data-testid="agent-use-kb" checked={useKb} onCheckedChange={setUseKb} />
          </div>

          {/* Temperature + max duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Temperature</Label>
                <span className="text-xs font-mono text-neutral-500" data-testid="agent-temp-value">
                  {Number(temperature).toFixed(2)}
                </span>
              </div>
              <Slider data-testid="agent-temperature" value={[Number(temperature)]} min={0} max={1} step={0.05}
                onValueChange={(v) => setTemperature(v[0])} />
              <p className="text-xs text-neutral-400">Lower = focused &amp; consistent. Higher = creative.</p>
            </div>
            <div className="space-y-2">
              <Label>Max call length <span className="text-neutral-400 font-normal">(minutes)</span></Label>
              <Input data-testid="agent-max-duration" type="number" min={1} max={60} value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)} className="rounded-xl" />
              <p className="text-xs text-neutral-400">The call auto-ends after this many minutes.</p>
            </div>
          </div>

          {/* Advanced (Bland passthrough params) */}
          <div className="rounded-xl border border-neutral-200 dark:border-white/10">
            <button type="button" onClick={() => setShowAdvanced((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
              data-testid="agent-advanced-toggle">
              <span className="flex items-center gap-2"><Wand2 className="w-4 h-4" /> Advanced Bland parameters</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>
            {showAdvanced && (
              <div className="px-4 pb-4 space-y-1.5">
                <Textarea data-testid="agent-extra-params" value={extra} rows={5}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder={'{\n  "wait_for_greeting": true,\n  "interruption_threshold": 100\n}'}
                  className="rounded-xl text-sm font-mono" />
                <p className="text-xs text-neutral-400">
                  Optional JSON merged into the Bland call payload (e.g. <code>wait_for_greeting</code>,{" "}
                  <code>interruption_threshold</code>, <code>voicemail_message</code>). Explicit fields above win.
                </p>
              </div>
            )}
          </div>

          {/* Active + default */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-neutral-400">Available for calls.</p>
              </div>
              <Switch data-testid="agent-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Default agent</p>
                <p className="text-xs text-neutral-400">Used for auto-calls.</p>
              </div>
              <Switch data-testid="agent-default" checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button data-testid="agent-save" onClick={save} disabled={saving}
            className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            {saving
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4 mr-1" /> {isNew ? "Create agent" : "Save changes"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Plays a REAL audio sample of the selected voice via the backend proxy (Bland's
// sample API). Samples are cached per voice for the dialog's lifetime so replaying
// (or re-selecting) a voice doesn't re-fetch/re-bill. No audio is ever synthesized
// client-side — if the fetch fails, we surface the error instead of faking it.
function VoicePreview({ voiceId }) {
  const [status, setStatus] = useState("idle"); // idle | loading | playing
  const audioRef = useRef(null);
  const cacheRef = useRef(new Map()); // voiceId -> object URL

  // Stop and reset whenever the chosen voice changes.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setStatus("idle");
  }, [voiceId]);

  // Revoke every cached object URL when the editor closes.
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      if (audioRef.current) audioRef.current.pause();
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, []);

  const play = async () => {
    if (status === "playing") {
      audioRef.current?.pause();
      setStatus("idle");
      return;
    }
    if (!voiceId) return;
    try {
      let url = cacheRef.current.get(voiceId);
      if (!url) {
        setStatus("loading");
        const blob = await agentsApi.voiceSample(voiceId);
        url = URL.createObjectURL(blob);
        cacheRef.current.set(voiceId, url);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setStatus("idle");
      audio.onerror = () => { setStatus("idle"); toast.error("Couldn’t play the voice sample"); };
      await audio.play();
      setStatus("playing");
    } catch (e) {
      setStatus("idle");
      toast.error("Couldn’t load voice preview", { description: e.message });
    }
  };

  return (
    <Button type="button" size="icon" variant="outline" onClick={play} disabled={!voiceId}
      data-testid="agent-voice-preview" title="Preview voice"
      className="rounded-full shrink-0 h-10 w-10">
      {status === "loading"
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : status === "playing"
          ? <Square className="w-4 h-4" />
          : <Play className="w-4 h-4" />}
    </Button>
  );
}
