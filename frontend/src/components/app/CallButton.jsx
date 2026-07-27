import { useState } from "react";
import { PhoneCall, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { leadsApi } from "@/lib/backend";

// Confirm → POST /api/call (FastAPI → Bland) → loading → result.
// Only calls our own backend; no keys in the browser.
export default function CallButton({ lead }) {
  const [phase, setPhase] = useState("idle"); // idle | confirm | calling | done | error
  const [callId, setCallId] = useState(null);
  const [error, setError] = useState(null);

  const placeCall = async () => {
    setPhase("calling");
    setError(null);
    try {
      const data = await leadsApi.call({
        leadId: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        company: lead.company,
        enquiry: lead.enquiry,
      });
      setCallId(data.call_id);
      setPhase("done");
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  };

  if (phase === "confirm") {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <span className="text-xs text-neutral-500">Call {lead.name} at {lead.phone}?</span>
        <div className="flex gap-2">
          <Button size="sm" data-testid={`call-confirm-${lead.id}`} onClick={placeCall}
            className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            Call now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPhase("idle")} className="rounded-full">Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button size="sm" data-testid={`call-btn-${lead.id}`} onClick={() => setPhase("confirm")}
        disabled={phase === "calling"}
        className="rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
        {phase === "calling" ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Calling…</>
          : <><PhoneCall className="w-3.5 h-3.5 mr-1" /> Call</>}
      </Button>
      {phase === "done" && callId && (
        <span className="flex items-center gap-1 text-xs font-medium text-neutral-900 dark:text-white">
          <Check className="w-3 h-3" /> Call started · {callId}
        </span>
      )}
      {phase === "error" && error && (
        <span className="flex items-start gap-1 max-w-[16rem] text-right text-xs text-muted-foreground">
          <X className="w-3 h-3 mt-0.5 shrink-0" /> {error}
        </span>
      )}
    </div>
  );
}
