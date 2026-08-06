import { PageHeader } from "@/components/shared/Primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Shield, CreditCard, Check } from "lucide-react";
import AutomationSettings from "@/components/app/AutomationSettings";
import CustomFieldsSettings from "@/components/app/CustomFieldsSettings";
import { toast } from "sonner";

const team = [
  { name: "Alex Johnson", email: "alex@vertexlabs.io", role: "Owner" },
  { name: "Maria Santos", email: "maria@vertexlabs.io", role: "Admin" },
  { name: "Tom Becker", email: "tom@vertexlabs.io", role: "Member" },
];

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your workspace, team, and preferences" testid="settings-header" />
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="rounded-full flex-wrap h-auto">
          {[
            ["profile", "Profile"], ["automation", "Automation"], ["customfields", "Custom fields"],
            ["organization", "Organization"], ["billing", "Billing"], ["team", "Team"],
            ["security", "Security"], ["notifications", "Notifications"],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value} data-testid={`settings-tab-${value}`} className="rounded-full">{label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="w-16 h-16"><AvatarFallback className="bg-neutral-900 border border-neutral-800 text-white text-xl">AJ</AvatarFallback></Avatar>
              <Button variant="outline" className="rounded-full" onClick={() => toast.success("Photo updated")}>Change photo</Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>First name</Label><Input defaultValue="Alex" className="rounded-xl" data-testid="settings-firstname" /></div>
              <div className="space-y-2"><Label>Last name</Label><Input defaultValue="Johnson" className="rounded-xl" /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Email</Label><Input defaultValue="alex@vertexlabs.io" className="rounded-xl" /></div>
            </div>
            <Button data-testid="save-profile-btn" onClick={() => toast.success("Profile saved")} className="mt-6 rounded-full bg-white text-black">Save changes</Button>
          </div>
        </TabsContent>

        <TabsContent value="automation">
          <AutomationSettings />
        </TabsContent>

        <TabsContent value="customfields">
          <CustomFieldsSettings />
        </TabsContent>

        <TabsContent value="organization">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl space-y-4">
            <div className="space-y-2"><Label>Organization name</Label><Input defaultValue="Vertex Labs" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Website</Label><Input defaultValue="vertexlabs.io" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Custom domain</Label><Input defaultValue="mail.vertexlabs.io" className="rounded-xl" /></div>
            <Button onClick={() => toast.success("Organization updated")} className="rounded-full bg-white text-black">Save</Button>
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl">
            <div className="flex items-center justify-between rounded-xl bg-neutral-900 border border-neutral-800 p-5 text-white">
              <div><p className="text-white/80 text-sm">Current plan</p><p className="font-heading text-2xl font-bold">Growth · $399/mo</p></div>
              <CreditCard className="w-8 h-8 opacity-80" />
            </div>
            <div className="mt-5 space-y-2 text-sm">
              {["5,000 AI leads/mo", "AI email + call agents", "Full CRM automation"].map(f => <div key={f} className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300"><Check className="w-4 h-4 text-neutral-600" />{f}</div>)}
            </div>
            <div className="flex gap-3 mt-6">
              <Button data-testid="upgrade-plan-btn" onClick={() => toast.success("Upgrade flow started")} className="rounded-full bg-neutral-900 dark:bg-white dark:text-neutral-900">Upgrade plan</Button>
              <Button variant="outline" className="rounded-full" onClick={() => toast.info("Invoices opened")}>View invoices</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="team">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden max-w-2xl">
            <div className="flex items-center justify-between px-5 h-14 border-b border-neutral-200 dark:border-white/10">
              <span className="font-heading font-semibold">Team members</span>
              <Button size="sm" data-testid="invite-member-btn" onClick={() => toast.success("Invite sent")} className="rounded-full bg-white text-black">Invite</Button>
            </div>
            {team.map((m) => (
              <div key={m.email} className="flex items-center gap-3 px-5 py-3 border-b border-neutral-100 dark:border-white/10 last:border-0">
                <Avatar className="w-9 h-9"><AvatarFallback className="text-xs">{m.name.split(" ").map(n=>n[0]).join("")}</AvatarFallback></Avatar>
                <div className="flex-1"><p className="text-sm font-medium">{m.name}</p><p className="text-xs text-neutral-400">{m.email}</p></div>
                <Badge variant="secondary" className="rounded-full">{m.role}</Badge>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl space-y-4">
            {[["Two-factor authentication", "Add an extra layer of security", true], ["Single sign-on (SSO)", "Require SSO for all members", false], ["Session timeout", "Auto-logout after inactivity", true]].map(([t, d, on]) => (
              <div key={t} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3"><Shield className="w-5 h-5 text-neutral-400" /><div><p className="font-medium text-sm">{t}</p><p className="text-xs text-neutral-400">{d}</p></div></div>
                <Switch defaultChecked={on} onCheckedChange={() => toast.success(`${t} updated`)} data-testid={`security-${t.toLowerCase().replace(/[^a-z]/g,"-")}`} />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-500/30 bg-neutral-50/50 dark:bg-neutral-500/5 p-6 max-w-2xl mt-6" data-testid="danger-zone">
            <div className="flex items-center gap-2 text-neutral-600 mb-2"><AlertTriangle className="w-5 h-5" /><h4 className="font-heading font-semibold">Danger Zone</h4></div>
            <p className="text-sm text-neutral-500 mb-4">Permanently delete your workspace and all associated data. This cannot be undone.</p>
            <Button variant="destructive" className="rounded-full" data-testid="delete-workspace-btn" onClick={() => toast.error("Workspace deletion requires confirmation")}>Delete workspace</Button>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 max-w-2xl space-y-4">
            {["Email sent", "Reply received", "Meeting booked", "Lead found", "Workflow completed", "Call completed"].map((n) => (
              <div key={n} className="flex items-center justify-between py-1.5">
                <p className="font-medium text-sm">{n}</p>
                <Switch defaultChecked onCheckedChange={() => toast.success(`${n} notifications updated`)} />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
