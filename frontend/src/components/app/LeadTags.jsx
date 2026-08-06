import { useEffect, useRef, useState } from "react";
import { Plus, X, Loader2, Tag as TagIcon, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { tagsApi } from "@/lib/backend";
import { toast } from "sonner";

// A small preset palette for new tags. Colour is the one place this otherwise
// monochrome UI uses hue — it's what makes a tag scannable at a glance.
export const TAG_COLORS = [
  "#6b7280", "#ef4444", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
];

// One tag chip: a coloured dot + name, optionally removable. Neutral chip body so
// it reads in both light and dark; the dot carries the colour.
export function TagChip({ tag, onRemove, small }) {
  return (
    <span
      data-testid={`tag-chip-${tag.id}`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-white/[0.04] text-neutral-700 dark:text-neutral-200 ${
        small ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"
      }`}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || "#6b7280" }} />
      <span className="truncate max-w-[10rem]">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(tag); }}
          data-testid={`tag-remove-${tag.id}`}
          className="ml-0.5 -mr-0.5 rounded-full p-0.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
          aria-label={`Remove ${tag.name}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

// Tag add/remove control for the lead detail page. Shows the lead's tags as
// removable chips and, behind a "+" button, a panel to toggle existing org tags
// or create a new one. Assign/unassign return the lead's full tag set, which we
// lift to the parent via onChange.
export default function LeadTags({ leadId, tags = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [orgTags, setOrgTags] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const panelRef = useRef(null);

  const assignedIds = new Set(tags.map((t) => t.id));

  // Load the org tag library the first time the panel opens.
  useEffect(() => {
    if (!open || orgTags !== null) return;
    setLoading(true);
    tagsApi.list()
      .then((data) => setOrgTags(Array.isArray(data) ? data : []))
      .catch((e) => { toast.error("Couldn’t load tags", { description: e.message }); setOrgTags([]); })
      .finally(() => setLoading(false));
  }, [open, orgTags]);

  // Close the panel on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = async (tag) => {
    setBusyId(tag.id);
    try {
      const updated = assignedIds.has(tag.id)
        ? await tagsApi.unassign(leadId, tag.id)
        : await tagsApi.assign(leadId, tag.id);
      onChange?.(Array.isArray(updated) ? updated : []);
    } catch (e) {
      toast.error("Couldn’t update tag", { description: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const removeChip = async (tag) => {
    try {
      const updated = await tagsApi.unassign(leadId, tag.id);
      onChange?.(Array.isArray(updated) ? updated : []);
    } catch (e) {
      toast.error("Couldn’t remove tag", { description: e.message });
    }
  };

  const createAndAssign = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const tag = await tagsApi.create({ name, color: newColor });
      setOrgTags((ts) => [...(ts || []), tag].sort((a, b) => a.name.localeCompare(b.name)));
      const updated = await tagsApi.assign(leadId, tag.id);
      onChange?.(Array.isArray(updated) ? updated : []);
      setNewName("");
      toast.success(`Tag “${name}” created`);
    } catch (e) {
      toast.error("Couldn’t create tag", { description: e.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="lead-tags">
      {tags.map((t) => (
        <TagChip key={t.id} tag={t} onRemove={removeChip} />
      ))}

      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          data-testid="lead-tags-add"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 dark:border-white/20 px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-400 transition-colors"
        >
          <Plus className="w-3 h-3" /> {tags.length ? "Tag" : "Add tag"}
        </button>

        {open && (
          <div
            className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0f0f0f] p-2 shadow-xl shadow-black/10"
            data-testid="lead-tags-panel"
          >
            <div className="max-h-52 overflow-y-auto">
              {loading && (
                <div className="flex items-center gap-2 px-2 py-3 text-xs text-neutral-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tags…
                </div>
              )}
              {!loading && orgTags?.length === 0 && (
                <p className="px-2 py-3 text-xs text-neutral-500">No tags yet — create one below.</p>
              )}
              {!loading && orgTags?.map((t) => {
                const on = assignedIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(t)}
                    disabled={busyId === t.id}
                    data-testid={`lead-tags-option-${t.id}`}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="flex-1 truncate">{t.name}</span>
                    {busyId === t.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />
                      : on && <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 border-t border-neutral-100 dark:border-white/10 pt-2">
              <div className="flex items-center gap-1.5">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    aria-label={`Colour ${c}`}
                    className={`w-4 h-4 rounded-full transition-transform ${newColor === c ? "ring-2 ring-offset-1 ring-neutral-900 dark:ring-white dark:ring-offset-[#0f0f0f] scale-110" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createAndAssign(); } }}
                  placeholder="New tag name…"
                  maxLength={60}
                  data-testid="lead-tags-new-name"
                  className="h-8 rounded-lg text-sm"
                />
                <Button
                  size="sm"
                  onClick={createAndAssign}
                  disabled={creating || !newName.trim()}
                  data-testid="lead-tags-create"
                  className="h-8 shrink-0 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TagIcon className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
