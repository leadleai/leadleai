import { useEffect, useState } from "react";
import { PhoneCall, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { leadsApi, agentsApi } from "@/lib/backend";

// The active agents are shared across every CallButton on the page and fetched at
// most once (lazily, when the first call is confirmed) — one row per lead would
// otherwise mean one request per lead.
let _agentsPromise = null;
function loadAgentsOnce() {
  if (!_agentsPromise) {
    _agentsPromise = agentsApi
      .list()
      .then((a) => (Array.isArray(a) ? a.filter((x) => x.is_active) : []))
      .catch(() => []);
  }
  return _agentsPromise;
}

// Confirm → POST /api/call (FastAPI → Bland via the chosen agent) → loading →
// result. Only calls our own backend; no keys in the browser. When the org has
// agents, the confirm step lets the user pick one (defaulting to the org default).
export default function CallButton({ lead }) {
  const [phase, setPhase] = useState("idle"); // idle | confirm | calling | done | error
  const [callId, setCallId] = useState(null);
  const [error, setError] = useState(null);
  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState("");

  // Load the agent list when the user opens the confirm step.
  useEffect(() => {
    if (phase !== "confirm") return;
    let alive = true;
    loadAgentsOnce().then((list) => {
      if (!alive) return;
      setAgents(list);
      const def = list.find((a) => a.is_default) || list[0];
      if (def) setAgentId((prev) => prev || def.id);
    });
    return () => { alive = false; };
  }, [phase]);

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
        agentId: agentId || null,
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
      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        <span className="text-xs text-neutral-500">Call {lead.name} at {lead.phone}?</span>
        {agents.length > 0 && (
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger data-testid={`call-agent-${lead.id}`} className="h-8 w-52 rounded-full text-xs">
              <SelectValue placeholder="Choose agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}{a.is_default ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
