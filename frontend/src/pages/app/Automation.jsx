import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search, Microscope, Sparkles, Mail, Clock, Repeat, Phone, CalendarClock,
  Workflow, ZoomIn, ZoomOut, Undo2, Plus, LayoutTemplate, Play
} from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { automationNodes } from "@/lib/mockData";
import { toast } from "sonner";

const iconMap = { Search, Microscope, Sparkles, Mail, Clock, Repeat, Phone, CalendarClock, Workflow };
const connections = [["n1","n2"],["n2","n3"],["n3","n4"],["n4","n5"],["n5","n6"],["n6","n7"],["n7","n8"],["n8","n9"]];

export default function Automation() {
  const [zoom, setZoom] = useState(1);
  const nodeById = Object.fromEntries(automationNodes.map(n => [n.id, n]));

  return (
    <div>
      <PageHeader title="Automation Builder" subtitle="Design autonomous workflows with drag-and-drop nodes" testid="automation-header"
        action={
          <div className="flex items-center gap-2">
            <Button data-testid="templates-btn" variant="outline" className="rounded-full" onClick={() => toast.info("Template gallery opened")}><LayoutTemplate className="w-4 h-4 mr-1" /> Templates</Button>
            <Button data-testid="run-workflow-btn" onClick={() => toast.success("Workflow activated")} className="rounded-full bg-white text-black"><Play className="w-4 h-4 mr-1" /> Activate</Button>
          </div>
        } />

      <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-neutral-200 dark:border-white/10">
          <Button size="icon" variant="ghost" className="rounded-lg w-8 h-8" data-testid="zoom-in" onClick={() => setZoom(z => Math.min(1.4, z + 0.1))}><ZoomIn className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" className="rounded-lg w-8 h-8" data-testid="zoom-out" onClick={() => setZoom(z => Math.max(0.6, z - 0.1))}><ZoomOut className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" className="rounded-lg w-8 h-8" data-testid="undo" onClick={() => toast.info("Undo")}><Undo2 className="w-4 h-4" /></Button>
          <span className="text-xs text-neutral-400 ml-2">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="ghost" className="rounded-lg ml-auto text-neutral-600" data-testid="add-node" onClick={() => toast.success("Node added")}><Plus className="w-4 h-4 mr-1" /> Add Node</Button>
        </div>

        <div className="relative overflow-auto grain" style={{ height: 480 }} data-testid="automation-canvas">
          <div className="relative" style={{ width: 760, height: 460, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <svg className="absolute inset-0 pointer-events-none" width="760" height="460">
              {connections.map(([a, b], i) => {
                const from = nodeById[a], to = nodeById[b];
                const x1 = from.x + 90, y1 = from.y + 30, x2 = to.x + 90, y2 = to.y + 30;
                return <path key={i} d={`M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`} stroke="#404040" strokeWidth="2" fill="none" />;
              })}
            </svg>
            {automationNodes.map((n, i) => {
              const Icon = iconMap[n.icon];
              return (
                <motion.div key={n.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                  className="absolute w-44 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm p-3 cursor-grab hover:border-neutral-400 hover:shadow-md transition-all"
                  style={{ left: n.x, top: n.y }} data-testid={`automation-node-${n.id}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white shrink-0"><Icon className="w-4 h-4" /></div>
                    <span className="font-medium text-sm">{n.label}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
