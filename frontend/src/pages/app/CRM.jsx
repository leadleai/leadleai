import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, GripVertical } from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { pipeline as initialPipeline, pipelineStages } from "@/lib/mockData";
import { toast } from "sonner";

const stageAccent = {
  "New Lead": "bg-slate-400", "Contacted": "bg-sky-400", "Qualified": "bg-indigo-400",
  "Demo": "bg-purple-400", "Proposal": "bg-fuchsia-400", "Negotiation": "bg-amber-400",
  "Won": "bg-emerald-500", "Lost": "bg-rose-400",
};

export default function CRM() {
  const [board, setBoard] = useState(initialPipeline);
  const [dragged, setDragged] = useState(null);

  const onDrop = (stage) => {
    if (!dragged) return;
    const { deal, from } = dragged;
    if (from === stage) return setDragged(null);
    setBoard((b) => {
      const next = { ...b };
      next[from] = next[from].filter((d) => d.id !== deal.id);
      next[stage] = [...next[stage], deal];
      return next;
    });
    toast.success(`${deal.company} moved to ${stage}`);
    setDragged(null);
  };

  const total = Object.values(board).flat().reduce((s, d) => s + parseInt(d.value.replace(/[^0-9]/g, "") || 0), 0);

  return (
    <div>
      <PageHeader title="CRM Pipeline" subtitle={`${Object.values(board).flat().length} deals · $${total}k total pipeline · updated by AI`} testid="crm-header"
        action={<Button data-testid="add-deal-btn" onClick={() => toast.success("New deal created")} className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg"><Plus className="w-4 h-4 mr-1" /> Add Deal</Button>} />

      <div className="flex gap-4 overflow-x-auto pb-4" data-testid="kanban-board">
        {pipelineStages.map((stage) => (
          <div key={stage} className="w-72 shrink-0 rounded-2xl bg-slate-100 dark:bg-slate-800/50 p-3"
            onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(stage)} data-testid={`kanban-col-${stage.replace(/\s+/g,"-").toLowerCase()}`}>
            <div className="flex items-center justify-between px-1 mb-3">
              <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${stageAccent[stage]}`} /><span className="font-heading font-semibold text-sm">{stage}</span></div>
              <span className="text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-full px-2 py-0.5">{board[stage].length}</span>
            </div>
            <div className="space-y-2 min-h-[60px]">
              {board[stage].map((deal) => (
                <motion.div key={deal.id} layout draggable
                  onDragStart={() => setDragged({ deal, from: stage })}
                  className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                  data-testid={`deal-${deal.id}`}>
                  <div className="flex items-start justify-between">
                    <p className="font-medium text-sm">{deal.company}</p>
                    <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{deal.contact}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="font-heading font-bold text-indigo-600">{deal.value}</span>
                    <span className="text-[10px] rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-500">{deal.owner}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
