import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Check, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customFieldsApi } from "@/lib/backend";
import { toast } from "sonner";

// Per-lead custom field values. Fetches the org's field definitions merged with
// this lead's current values, and lets you edit each one inline. Text/number/date
// save on blur (when changed); dropdowns save on change. A brief check confirms
// each save. If the org has defined no fields, it points to the admin screen.
export default function LeadCustomFields({ leadId }) {
  const [fields, setFields] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);

  const load = useCallback(async () => {
    setState("loading"); setError(null);
    try {
      const data = await customFieldsApi.getForLead(leadId);
      setFields(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (e) {
      setError(e.message); setState("error");
    }
  }, [leadId]);
  useEffect(() => { load(); }, [load]);

  const save = async (field, value) => {
    if (value === field.value) return;
    setSavingId(field.field_def_id);
    try {
      const updated = await customFieldsApi.setForLead(leadId, field.field_def_id, value);
      setFields(Array.isArray(updated) ? updated : fields);
      setSavedId(field.field_def_id);
      setTimeout(() => setSavedId((id) => (id === field.field_def_id ? null : id)), 1500);
    } catch (e) {
      toast.error(`Couldn’t save ${field.label}`, { description: e.message });
      load(); // resync to the stored value on failure
    } finally {
      setSavingId(null);
    }
  };

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-neutral-500" data-testid="lead-customfields-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading custom fields…
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-xl border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.03] p-4 text-sm" data-testid="lead-customfields-error">
        <p className="text-muted-foreground">{error}</p>
        <button onClick={load} className="mt-2 text-sm font-medium underline underline-offset-4">Try again</button>
      </div>
    );
  }

  return (
    <div data-testid="lead-customfields">
      <h2 className="font-heading font-semibold text-lg mb-4">Custom fields</h2>

      {fields.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 text-center text-sm text-muted-foreground" data-testid="lead-customfields-empty">
          <SlidersHorizontal className="w-5 h-5 mx-auto mb-2 text-neutral-400" />
          Your organization hasn’t defined any custom fields yet.
          <div className="mt-2">
            <Link to="/app/settings" className="text-sm font-medium underline underline-offset-4 text-neutral-900 dark:text-white">
              Define custom fields in Settings →
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <FieldRow
              key={f.field_def_id}
              field={f}
              saving={savingId === f.field_def_id}
              saved={savedId === f.field_def_id}
              onSave={(v) => save(f, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({ field, saving, saved, onSave }) {
  const [value, setValue] = useState(field.value || "");
  useEffect(() => { setValue(field.value || ""); }, [field.value]);

  const common = "rounded-xl text-sm";
  const testid = `lead-customfield-${field.field_key}`;

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {field.label}
        {saving && <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />}
        {saved && <Check className="w-3 h-3 text-neutral-900 dark:text-white" />}
      </Label>

      {field.field_type === "select" ? (
        <select
          value={value}
          onChange={(e) => { setValue(e.target.value); onSave(e.target.value); }}
          data-testid={testid}
          className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-white/[0.02] px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 outline-none"
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <Input
          type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onSave(value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          data-testid={testid}
          className={common}
          placeholder={`Add ${field.label.toLowerCase()}…`}
        />
      )}
    </div>
  );
}
