import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Video, Clock, Globe, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { meetings } from "@/lib/mockData";
import { toast } from "sonner";

const slots = ["9:00 AM", "10:30 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:30 PM", "4:00 PM", "5:00 PM"];
const typeColor = { Demo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", Discovery: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", Proposal: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300", "Follow-up": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };

export default function Meetings() {
  const [date, setDate] = useState(new Date());
  const [slot, setSlot] = useState("2:00 PM");
  return (
    <div>
      <PageHeader title="AI Meeting Scheduler" subtitle="Auto-detected time zones · zero back-and-forth" testid="meetings-header"
        action={<Button data-testid="new-meeting-btn" onClick={() => toast.success("Meeting slot shared")} className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg"><Plus className="w-4 h-4 mr-1" /> New Meeting</Button>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex flex-col md:flex-row gap-6">
            <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-xl" data-testid="scheduler-calendar" />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-3"><Globe className="w-4 h-4" /> Pacific Time (auto-detected)</div>
              <p className="font-heading font-semibold mb-3">Available slots</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slots.map((s) => (
                  <button key={s} data-testid={`slot-${s.replace(/[:\s]/g,"")}`} onClick={() => setSlot(s)}
                    className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${slot === s ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"}`}>{s}</button>
                ))}
              </div>
              <Button data-testid="confirm-booking-btn" onClick={() => toast.success(`Meeting confirmed for ${slot}`)} className="w-full mt-4 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600">Confirm Booking</Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h4 className="font-heading font-semibold mb-4">Upcoming meetings</h4>
          <div className="space-y-3">
            {meetings.map((m, i) => (
              <motion.div key={m.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5" data-testid={`meeting-${m.id}`}>
                <div className="flex items-center justify-between"><Badge className={`rounded-full border-0 text-xs ${typeColor[m.type]}`}>{m.type}</Badge><span className="text-xs text-slate-400">{m.date}</span></div>
                <p className="font-medium text-sm mt-2">{m.title}</p>
                <p className="text-xs text-slate-400">with {m.with}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm flex items-center gap-1 text-slate-500"><Clock className="w-3.5 h-3.5" /> {m.time}</span>
                  <Button size="sm" variant="ghost" className="h-7 rounded-lg text-indigo-600" onClick={() => toast.info("Joining call...")}><Video className="w-4 h-4 mr-1" /> Join</Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
