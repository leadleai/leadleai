import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Loader2, Trash2, Save, X, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { customFieldsApi, CUSTOM_FIELD_TYPES } from "@/lib/backend";
import { toast } from "sonner";

const typeLabel = (t) => CUSTOM_FIELD_TYPES.find((x) => x.value === t)?.label || t;
// Derive a lower_snake field_key from a label, matching the backend's slug rule.
const slugify = (s) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50)
    .replace(/^([0-9])/, "f_$1");

// Org-level admin for custom field definitions: the schema every lead's custom
// field values are read/written against (see LeadCustomFields). Definitions are
// org-scoped and RLS-enforced on the backend.
export default function CustomFieldsSettings() {
  const [defs, setDefs] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      const data = await customFieldsApi.listDefs();
      setDefs(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (e) {
      setError(e.message); setState("error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onCreated = (def) => { setDefs((d) => [...d, def]); setAdding(false); };
  const onUpdated = (def) => setDefs((d) => d.map((x) => (x.id === def.id ? def : x)));
  const onDeleted = (id) => setDefs((d) => d.filter((x) => x.id !== id));

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading font-semibold">Custom fields</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define extra attributes your team can fill in on each lead.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setAdding(true)}
          disabled={adding}
          data-testid="cf-add-btn"
          className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        >
          <Plus className="w-4 h-4 mr-1" /> Add field
        </Button>
      </div>

      {adding && <NewFieldCard existing={defs} onCreated={onCreated} onCancel={() => setAdding(false)} />}

      {state === "loading" && (
        <div className="flex items-center gap-2 py-8 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading fields…
        </div>
      )}

      {state === "error" && (
        <div className="rounded-2xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-6 text-sm" data-testid="cf-error">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="w-4 h-4" /> Couldn’t load custom fields</div>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={load}>Try again</Button>
        </div>
      )}

      {state === "ready" && defs.length === 0 && !adding && (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/10 bg-white dark:bg-white/[0.02] py-12 flex flex-col items-center text-center px-6" data-testid="cf-empty">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
            <SlidersHorizontal className="w-5 h-5 text-neutral-500" />
          </div>
          <h4 className="font-heading font-semibold">No custom fields yet</h4>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Add fields like “Budget”, “Region”, or “Deal size” to capture on every lead.
          </p>
        </div>
      )}

      {state === "ready" && defs.length > 0 && (
        <div className="space-y-3">
          {defs.map((def) => (
            <DefCard key={def.id} def={def} onUpdated={onUpdated} onDeleted={onDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}

// Create form: label + key + type (+ options for select).
function NewFieldCard({ existing, onCreated, onCancel }) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState("text");
  const [optionsText, setOptionsText] = useState("");
  const [saving, setSaving] = useState(false);

  const effectiveKey = keyTouched ? key : slugify(label);
  const options = optionsText.split(",").map((o) => o.trim()).filter(Boolean);
  const keyClash = existing.some((d) => d.field_key === effectiveKey);
  const valid = label.trim() && effectiveKey && !keyClash && (type !== "select" || options.length > 0);

  const save = async () => {
    setSaving(true);
    try {
      const created = await customFieldsApi.createDef({
        field_key: effectiveKey,
        label: label.trim(),
        field_type: type,
        options: type === "select" ? options : [],
      });
      toast.success(`Field “${created.label}” added`);
      onCreated(created);
    } catch (e) {
      toast.error("Couldn’t add field", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 space-y-3 mb-3"
      data-testid="cf-new-card"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Budget"
            data-testid="cf-label" className="rounded-xl" maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label>Field key</Label>
          <Input value={effectiveKey}
            onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toLowerCase()); }}
            placeholder="budget" data-testid="cf-key" className="rounded-xl font-mono text-xs" maxLength={50} />
          {keyClash && <p className="text-xs text-neutral-500">That key is already in use.</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Type</Label>
        <select value={type} onChange={(e) => setType(e.target.value)} data-testid="cf-type"
          className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-white/[0.02] px-3 py-2 text-sm outline-none">
          {CUSTOM_FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {type === "select" && (
        <div className="space-y-1.5">
          <Label>Options <span className="text-neutral-400 font-normal">(comma-separated)</span></Label>
          <Input value={optionsText} onChange={(e) => setOptionsText(e.target.value)}
            placeholder="Small, Medium, Large" data-testid="cf-options" className="rounded-xl" />
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {options.map((o) => (
                <Badge key={o} className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 font-normal">{o}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" className="rounded-full" onClick={onCancel} disabled={saving}>
          <X className="w-4 h-4 mr-1" /> Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={!valid || saving} data-testid="cf-create"
          className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
          {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-1" /> Add field</>}
        </Button>
      </div>
    </motion.div>
  );
}

// Existing definition: shows key/type (immutable), lets you edit the label and,
// for select fields, the options; and delete the whole field.
function DefCard({ def, onUpdated, onDeleted }) {
  const [label, setLabel] = useState(def.label);
  const [optionsText, setOptionsText] = useState((def.options || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const options = optionsText.split(",").map((o) => o.trim()).filter(Boolean);
  const isSelect = def.field_type === "select";
  const dirty = label.trim() !== def.label ||
    (isSelect && optionsText !== (def.options || []).join(", "));
  const canSave = dirty && label.trim() && (!isSelect || options.length > 0) && !saving;

  const save = async () => {
    setSaving(true);
    try {
      const patch = { label: label.trim() };
      if (isSelect) patch.options = options;
      const updated = await customFieldsApi.updateDef(def.id, patch);
      toast.success("Field saved");
      onUpdated(updated);
    } catch (e) {
      toast.error("Couldn’t save field", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await customFieldsApi.removeDef(def.id);
      toast.success("Field deleted");
      onDeleted(def.id);
    } catch (e) {
      toast.error("Couldn’t delete field", { description: e.message });
      setDeleting(false); setConfirmDelete(false);
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 space-y-3" data-testid={`cf-card-${def.id}`}>
      <div className="flex items-center gap-2">
        <code className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-600 dark:text-neutral-300">{def.field_key}</code>
        <Badge className="rounded-full border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 font-normal">{typeLabel(def.field_type)}</Badge>
      </div>
      <div className="space-y-1.5">
        <Label>Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-xl" maxLength={100}
          data-testid={`cf-edit-label-${def.id}`} />
      </div>
      {isSelect && (
        <div className="space-y-1.5">
          <Label>Options <span className="text-neutral-400 font-normal">(comma-separated)</span></Label>
          <Input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} className="rounded-xl"
            data-testid={`cf-edit-options-${def.id}`} />
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Delete this field and its values?</span>
            <Button size="sm" variant="ghost" className="rounded-full h-8" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
            <Button size="sm" className="rounded-full h-8 bg-neutral-900 text-white dark:bg-white dark:text-black"
              data-testid={`cf-confirm-delete-${def.id}`} onClick={remove} disabled={deleting}>
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Delete"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="rounded-full h-8 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            onClick={() => setConfirmDelete(true)} data-testid={`cf-delete-${def.id}`}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
          </Button>
        )}
        <Button size="sm" onClick={save} disabled={!canSave} data-testid={`cf-save-${def.id}`}
          className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
          {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-1" /> Save</>}
        </Button>
      </div>
    </div>
  );
}
