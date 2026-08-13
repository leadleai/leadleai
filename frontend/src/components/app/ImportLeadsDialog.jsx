import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { leadsApi, IMPORT_FIELDS } from "@/lib/backend";
import { toast } from "sonner";

// Value the mapping selects use for "don't map this field". Empty-string <option>
// values get coerced oddly by some browsers, so use an explicit sentinel.
const UNMAPPED = "__none__";

/**
 * Upload → map columns → confirm → summary, in one dialog. Stateless on the
 * server: the same file is sent on preview and on confirm (with the mapping), so
 * nothing is buffered server-side between steps.
 */
export default function ImportLeadsDialog({ open, onOpenChange, onImported }) {
  const [step, setStep] = useState("upload"); // upload | map | done
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);   // { columns, preview, row_count, truncated, suggested_mapping }
  const [mapping, setMapping] = useState({});      // { field: columnHeader | UNMAPPED }
  const [summary, setSummary] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const reset = useCallback(() => {
    setStep("upload"); setFile(null); setBusy(false); setError(null);
    setPreview(null); setMapping({}); setSummary(null); setDragOver(false);
  }, []);

  const handleOpenChange = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const doPreview = useCallback(async (f) => {
    if (!f) return;
    setBusy(true); setError(null); setFile(f);
    try {
      const p = await leadsApi.importFilePreview(f);
      setPreview(p);
      // Seed the mapping from the server's suggestion; unmapped fields -> sentinel.
      const seeded = {};
      for (const { key } of IMPORT_FIELDS) seeded[key] = p.suggested_mapping?.[key] || UNMAPPED;
      setMapping(seeded);
      setStep("map");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (f) doPreview(f);
    e.target.value = ""; // allow re-picking the same file
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) doPreview(f);
  };

  const mappedContact = ["name", "phone", "email"].some((k) => mapping[k] && mapping[k] !== UNMAPPED);

  const doConfirm = async () => {
    setBusy(true); setError(null);
    try {
      // Strip sentinels back to a clean {field: columnHeader} object for the API.
      const clean = {};
      for (const [k, v] of Object.entries(mapping)) if (v && v !== UNMAPPED) clean[k] = v;
      const s = await leadsApi.importFileConfirm(file, clean);
      setSummary(s);
      setStep("done");
      const queued = s.auto_calls?.queued || 0;
      toast.success(`Imported ${s.imported} · updated ${s.updated} · skipped ${s.skipped}`, {
        description: queued ? `${queued} auto-call${queued > 1 ? "s" : ""} queued` : undefined,
      });
      onImported?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="import-file-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Import leads from a file
          </DialogTitle>
          <DialogDescription>
            Upload a .xlsx, .xls, or .csv, map the columns, and confirm. Imported leads flow
            through your normal auto-call and follow-up automation.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300" data-testid="import-error">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {/* STEP 1 — upload */}
        {step === "upload" && (
          <div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              disabled={busy}
              data-testid="import-dropzone"
              className={`w-full rounded-2xl border-2 border-dashed p-10 flex flex-col items-center justify-center text-center transition-colors ${
                dragOver ? "border-neutral-900 dark:border-white bg-neutral-50 dark:bg-white/5" : "border-neutral-300 dark:border-white/15 hover:border-neutral-400"
              }`}
            >
              {busy ? <Loader2 className="w-8 h-8 mb-3 animate-spin text-neutral-500" /> : <UploadCloud className="w-8 h-8 mb-3 text-neutral-500" />}
              <div className="font-medium">{busy ? "Reading file…" : "Drop a spreadsheet here, or click to browse"}</div>
              <div className="text-xs text-muted-foreground mt-1">.xlsx, .xls, or .csv · up to 8 MB</div>
            </button>
            <input
              ref={inputRef} type="file" accept=".csv,.xls,.xlsx,.xlsm" className="hidden"
              onChange={onPick} data-testid="import-file-input"
            />
          </div>
        )}

        {/* STEP 2 — map columns */}
        {step === "map" && preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="w-4 h-4" />
              <span className="font-medium text-foreground truncate">{preview.filename}</span>
              <span>· {preview.row_count} row{preview.row_count === 1 ? "" : "s"}{preview.truncated ? "+ (capped)" : ""}</span>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Map your columns</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {IMPORT_FIELDS.map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-white/10 px-3 py-2">
                    <span className="text-sm font-medium">{label}</span>
                    <select
                      data-testid={`import-map-${key}`}
                      value={mapping[key] ?? UNMAPPED}
                      onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-white/[0.02] px-2 py-1 text-sm outline-none max-w-[55%]"
                    >
                      <option value={UNMAPPED}>— Don't import —</option>
                      {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {!mappedContact && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Map at least one of Name, Phone, or Email to import.
                </p>
              )}
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Preview</div>
              <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-white/10">
                <table className="min-w-full text-xs">
                  <thead className="bg-neutral-50 dark:bg-white/[0.03]">
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c} className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-white/10">
                    {preview.preview.map((row, i) => (
                      <tr key={i}>
                        {preview.columns.map((c) => (
                          <td key={c} className="px-3 py-1.5 whitespace-nowrap max-w-[180px] truncate">{row[c]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — summary */}
        {step === "done" && summary && (
          <div className="space-y-4" data-testid="import-summary">
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-white/10 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="font-heading font-semibold text-lg">Import complete</div>
              <div className="text-sm text-muted-foreground">{summary.total} row{summary.total === 1 ? "" : "s"} processed</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[["Imported", summary.imported], ["Updated", summary.updated], ["Skipped", summary.skipped]].map(([label, n]) => (
                <div key={label} className="rounded-xl border border-neutral-200 dark:border-white/10 p-3 text-center">
                  <div className="text-2xl font-semibold">{n}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            {summary.skipped_reasons && Object.keys(summary.skipped_reasons).length > 0 && (
              <div className="text-xs text-muted-foreground">
                Skipped: {Object.entries(summary.skipped_reasons).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(" · ")}
              </div>
            )}
            {(summary.auto_calls?.queued || 0) > 0 && (
              <div className="text-xs text-muted-foreground">
                {summary.auto_calls.queued} auto-call{summary.auto_calls.queued > 1 ? "s" : ""} queued for the new leads.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === "map" && (
            <>
              <Button variant="outline" className="rounded-full" onClick={() => { reset(); }} disabled={busy}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Choose another file
              </Button>
              <Button
                className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                onClick={doConfirm} disabled={busy || !mappedContact}
                data-testid="import-confirm-btn"
              >
                {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing…</> : <>Import {preview?.row_count} lead{preview?.row_count === 1 ? "" : "s"}</>}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button className="rounded-full" onClick={() => handleOpenChange(false)} data-testid="import-done-btn">
              Done
            </Button>
          )}
          {step === "upload" && (
            <Button variant="outline" className="rounded-full" onClick={() => handleOpenChange(false)}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
