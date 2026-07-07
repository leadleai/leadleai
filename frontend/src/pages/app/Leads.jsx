import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Filter, Search, Download, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { leads } from "@/lib/mockData";
import { toast } from "sonner";

const statusColor = { Hot: "bg-neutral-100 text-neutral-700 dark:bg-neutral-500/15 dark:text-neutral-300", Warm: "bg-neutral-100 text-neutral-700 dark:bg-neutral-500/15 dark:text-neutral-300", Cold: "bg-neutral-100 text-neutral-700 dark:bg-neutral-500/15 dark:text-neutral-300" };

export default function Leads() {
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("all");
  const [selected, setSelected] = useState([]);

  const filtered = leads.filter((l) =>
    (l.company.toLowerCase().includes(query.toLowerCase()) || l.contact.toLowerCase().includes(query.toLowerCase())) &&
    (industry === "all" || l.industry === industry)
  );

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const industries = [...new Set(leads.map(l => l.industry))];

  return (
    <div>
      <PageHeader title="Lead Discovery" subtitle={`${filtered.length} prospects matching your ideal customer profile`} testid="leads-header"
        action={<Button data-testid="generate-leads-btn" onClick={() => toast.success("Generating new leads with AI...")} className="rounded-full bg-white text-black hover:shadow-lg"><Sparkles className="w-4 h-4 mr-1" /> Generate Leads</Button>} />

      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input data-testid="leads-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company or contact..." className="pl-9 rounded-xl" />
          </div>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger data-testid="leads-industry-filter" className="w-full sm:w-48 rounded-xl"><SelectValue placeholder="Industry" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              {industries.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button data-testid="leads-filter-btn" variant="outline" className="rounded-xl" onClick={() => toast.info("Advanced filters opened")}><Filter className="w-4 h-4 mr-1" /> Filters</Button>
          <Button data-testid="leads-save-search" variant="outline" className="rounded-xl" onClick={() => toast.success("Search saved")}><Star className="w-4 h-4 mr-1" /> Save</Button>
        </div>

        {selected.length > 0 && (
          <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-500/10 flex items-center gap-3 text-sm" data-testid="bulk-actions-bar">
            <span className="font-medium">{selected.length} selected</span>
            <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => toast.success("Added to campaign")}>Add to campaign</Button>
            <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => toast.success("Emails generated")}>Generate emails</Button>
            <Button size="sm" variant="ghost" className="h-7 rounded-lg ml-auto" onClick={() => setSelected([])}>Clear</Button>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10"></TableHead>
                <TableHead>Company</TableHead><TableHead>Decision Maker</TableHead><TableHead>Title</TableHead>
                <TableHead>Industry</TableHead><TableHead>Employees</TableHead><TableHead>Revenue</TableHead>
                <TableHead>Tech</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" data-testid={`lead-row-${l.id}`}>
                  <TableCell><Checkbox checked={selected.includes(l.id)} onCheckedChange={() => toggle(l.id)} data-testid={`lead-checkbox-${l.id}`} /></TableCell>
                  <TableCell><div className="font-medium">{l.company}</div><div className="text-xs text-neutral-400">{l.website}</div></TableCell>
                  <TableCell>{l.contact}</TableCell>
                  <TableCell className="text-neutral-500 text-sm">{l.title}</TableCell>
                  <TableCell className="text-neutral-500 text-sm">{l.industry}</TableCell>
                  <TableCell className="text-neutral-500 text-sm">{l.employees}</TableCell>
                  <TableCell className="text-neutral-500 text-sm">{l.revenue}</TableCell>
                  <TableCell><Badge variant="secondary" className="rounded-full font-normal">{l.tech}</Badge></TableCell>
                  <TableCell><div className="flex items-center gap-2"><div className="w-9 text-sm font-semibold">{l.score}</div><div className="w-12 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden"><div className="h-full bg-white text-black" style={{ width: `${l.score}%` }} /></div></div></TableCell>
                  <TableCell><Badge className={`rounded-full font-medium border-0 ${statusColor[l.status]}`}>{l.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
