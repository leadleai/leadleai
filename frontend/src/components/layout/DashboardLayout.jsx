import { useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, UsersRound, Microscope, Megaphone, Mail, Phone, CalendarClock,
  Kanban, BarChart3, Workflow, BookOpen, Plug, Settings as SettingsIcon,
  Search, Bell, Sparkles, Sun, Moon, Menu, X, Send, Command, ChevronDown, Check
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from "@/components/ui/command";
import { notifications } from "@/lib/mockData";
import { toast } from "sonner";

const nav = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/app" },
  { label: "Leads", icon: Users, path: "/app/leads" },
  { label: "Team", icon: UsersRound, path: "/app/team" },
  { label: "Campaigns", icon: Megaphone, path: "/app/campaigns" },
  { label: "Emails", icon: Mail, path: "/app/emails" },
  { label: "Calls", icon: Phone, path: "/app/calls" },
  { label: "Meetings", icon: CalendarClock, path: "/app/meetings" },
  { label: "Analytics", icon: BarChart3, path: "/app/analytics" },
  { label: "Automation", icon: Workflow, path: "/app/automation" },
  { label: "Knowledge Base", icon: BookOpen, path: "/app/knowledge" },
  { label: "Integrations", icon: Plug, path: "/app/integrations" },
  { label: "Settings", icon: SettingsIcon, path: "/app/settings" },
];

function SidebarContent({ onNavigate }) {
  const location = useLocation();
  return (
    <div className="flex h-full flex-col">
      <Link to="/app" className="flex items-center gap-2.5 px-5 h-16 shrink-0" data-testid="sidebar-logo">
        <Logo className="w-6 h-6 text-foreground" />
        <span className="font-heading font-bold text-lg tracking-tight">SaleScale AI</span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {nav.map((item) => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <item.icon className="w-[18px] h-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3">
        <div className="rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
          <p className="font-heading font-semibold text-sm">Upgrade to Growth</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Unlock unlimited AI leads & calls.</p>
          <Button data-testid="sidebar-upgrade-btn" onClick={() => toast.success("Upgrade flow started")} className="mt-3 w-full h-8 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-black hover:opacity-90 text-xs">Upgrade</Button>
        </div>
      </div>
    </div>
  );
}

function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "ai", text: "Hi! I'm your LeadPilot AI assistant. Ask me to find leads, draft campaigns, or analyze results." },
  ]);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    const q = input;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setTimeout(() => {
      setMessages((m) => [...m, { role: "ai", text: `Working on: "${q}". I found 42 matching leads and drafted 3 outreach variations for you.` }]);
    }, 700);
  };

  return (
    <>
      <motion.button
        data-testid="ai-assistant-fab"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-full bg-white text-black shadow-lg shadow-black/30 flex items-center justify-center"
      >
        <Sparkles className="w-6 h-6" />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-40 w-[360px] max-w-[calc(100vw-3rem)] rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden"
            data-testid="ai-assistant-panel"
          >
            <div className="flex items-center justify-between px-4 h-14 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-foreground">
              <div className="flex items-center gap-2"><Sparkles className="w-5 h-5" /><span className="font-heading font-semibold">AI Assistant</span></div>
              <button data-testid="ai-assistant-close" onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="h-72 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200"}`}>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex gap-2">
              <Input data-testid="ai-assistant-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask anything..." className="rounded-xl" />
              <Button data-testid="ai-assistant-send" onClick={send} size="icon" className="rounded-xl bg-white text-black hover:bg-neutral-200 shrink-0"><Send className="w-4 h-4" /></Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Signed-in user, their org (with a switcher when they're in several), logout. */
function UserMenu() {
  const navigate = useNavigate();
  const { user, org, orgs, switchOrg, signOut } = useAuth();

  const email = user?.email || "";
  const initials = (email.split("@")[0] || "?")
    .split(/[.\-_]/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("") || "?";

  const logout = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/login", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button data-testid="profile-menu-btn" className="flex items-center gap-2 rounded-xl pl-1 pr-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-neutral-900 dark:bg-white text-white dark:text-black text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:block text-left leading-tight max-w-[9rem]">
            <span className="block text-xs font-medium truncate" data-testid="header-user-email">{email}</span>
            <span className="block text-[11px] text-neutral-400 truncate" data-testid="header-org-name">{org?.name || "…"}</span>
          </span>
          <ChevronDown className="w-4 h-4 text-neutral-400 hidden sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="font-semibold truncate">{email || "Signed in"}</div>
          <div className="text-xs font-normal text-neutral-400 truncate">
            {org?.name}{org?.role ? ` · ${org.role}` : ""}
          </div>
        </DropdownMenuLabel>

        {orgs.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-neutral-400 font-normal">Switch workspace</DropdownMenuLabel>
            {orgs.map((o) => (
              <DropdownMenuItem key={o.id} onClick={() => switchOrg(o.id)} data-testid={`switch-org-${o.id}`}>
                <span className="truncate flex-1">{o.name}</span>
                {o.id === org?.id && <Check className="w-4 h-4 ml-2 shrink-0" />}
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/app/team")} data-testid="profile-team">Team</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/app/settings")} data-testid="profile-settings">Settings</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/app/integrations")}>Integrations</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} data-testid="profile-logout">Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DashboardLayout() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [cmdOpen, setCmdOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 selection:bg-neutral-100">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 z-30">
        <SidebarContent />
      </aside>

      <div className="lg:pl-64">
        {/* Top navbar */}
        <header className="sticky top-0 z-20 h-16 glass border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3 px-4 sm:px-6">
          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button data-testid="mobile-menu-btn" variant="ghost" size="icon" className="lg:hidden rounded-xl"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle></SheetHeader>
              <SidebarContent />
            </SheetContent>
          </Sheet>

          <button
            data-testid="global-search-trigger"
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 flex-1 max-w-md h-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3.5 text-sm text-neutral-400"
          >
            <Search className="w-4 h-4" /> Search leads, companies, meetings...
            <span className="ml-auto hidden sm:flex items-center gap-1 text-xs text-neutral-400"><Command className="w-3 h-3" />K</span>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <Button data-testid="theme-toggle" variant="ghost" size="icon" onClick={toggle} className="rounded-xl">
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="notifications-btn" variant="ghost" size="icon" className="rounded-xl relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-neutral-600" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.map((n) => (
                  <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2.5" data-testid={`notification-${n.id}`}>
                    <span className="text-sm">{n.text}</span>
                    <span className="text-xs text-neutral-400">{n.time}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button data-testid="assistant-nav-btn" variant="ghost" size="icon" className="rounded-xl hidden sm:flex" onClick={() => toast.info("AI Assistant is bottom-right ✨")}>
              <Sparkles className="w-5 h-5 text-neutral-600" />
            </Button>

            <UserMenu />
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 pb-24">
          <Outlet />
        </main>
      </div>

      <AIAssistant />

      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <CommandInput placeholder="Search companies, leads, meetings, campaigns..." data-testid="command-input" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {nav.map((n) => (
              <CommandItem key={n.path} onSelect={() => { navigate(n.path); setCmdOpen(false); }}>
                <n.icon className="mr-2 w-4 h-4" />{n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Leads">
            <CommandItem onSelect={() => { navigate("/app/leads"); setCmdOpen(false); }}><Users className="mr-2 w-4 h-4" />Acme Robotics — Sarah Jenkins</CommandItem>
            <CommandItem onSelect={() => { navigate("/app/leads"); setCmdOpen(false); }}><Users className="mr-2 w-4 h-4" />Fabrikam Fintech — Elena Rodriguez</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
