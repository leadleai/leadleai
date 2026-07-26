// Centralized realistic sample data for LeadPilot AI

export const leads = [
  { id: 1, company: "Acme Robotics", website: "acmerobotics.io", contact: "Sarah Jenkins", title: "VP of Sales", email: "sarah@acmerobotics.io", phone: "+1 415-555-0132", linkedin: "in/sarahjenkins", industry: "Manufacturing", employees: "520", revenue: "$84M", tech: "Salesforce", score: 94, status: "Hot", intent: "High" },
  { id: 2, company: "Northwind Health", website: "northwindhealth.com", contact: "Michael Chen", title: "Director of Growth", email: "m.chen@northwind.com", phone: "+1 206-555-0198", linkedin: "in/michaelchen", industry: "Healthcare", employees: "1,200", revenue: "$210M", tech: "HubSpot", score: 88, status: "Warm", intent: "Medium" },
  { id: 3, company: "Fabrikam Fintech", website: "fabrikam.co", contact: "Elena Rodriguez", title: "Head of Revenue", email: "elena@fabrikam.co", phone: "+1 512-555-0143", linkedin: "in/elenar", industry: "Financial Services", employees: "340", revenue: "$56M", tech: "Pipedrive", score: 91, status: "Hot", intent: "High" },
  { id: 4, company: "Contoso Cloud", website: "contoso.dev", contact: "James Wilson", title: "CRO", email: "james@contoso.dev", phone: "+1 650-555-0176", linkedin: "in/jameswilson", industry: "SaaS", employees: "780", revenue: "$120M", tech: "Salesforce", score: 79, status: "Warm", intent: "Medium" },
  { id: 5, company: "Tailspin Toys", website: "tailspin.com", contact: "Priya Patel", title: "VP Marketing", email: "priya@tailspin.com", phone: "+1 312-555-0110", linkedin: "in/priyapatel", industry: "Retail", employees: "150", revenue: "$28M", tech: "Zoho", score: 72, status: "Cold", intent: "Low" },
  { id: 6, company: "Adventure Works", website: "adventureworks.io", contact: "David Kim", title: "Sales Manager", email: "david@aworks.io", phone: "+1 408-555-0187", linkedin: "in/davidkim", industry: "Logistics", employees: "2,400", revenue: "$430M", tech: "HubSpot", score: 85, status: "Warm", intent: "High" },
  { id: 7, company: "Wingtip Media", website: "wingtip.tv", contact: "Olivia Brown", title: "Chief Growth Officer", email: "olivia@wingtip.tv", phone: "+1 917-555-0164", linkedin: "in/oliviabrown", industry: "Media", employees: "95", revenue: "$18M", tech: "Pipedrive", score: 68, status: "Cold", intent: "Low" },
  { id: 8, company: "Proseware Inc", website: "proseware.com", contact: "Daniel Garcia", title: "VP Operations", email: "daniel@proseware.com", phone: "+1 305-555-0129", linkedin: "in/danielgarcia", industry: "Technology", employees: "610", revenue: "$97M", tech: "Salesforce", score: 90, status: "Hot", intent: "High" },
];

export const activities = [
  { id: 1, type: "email", text: "AI sent personalized email to Sarah Jenkins at Acme Robotics", time: "2 min ago", icon: "Mail" },
  { id: 2, type: "reply", text: "Michael Chen replied: \"Interested, let's talk Thursday\"", time: "18 min ago", icon: "MessageSquare" },
  { id: 3, type: "meeting", text: "Meeting booked with Elena Rodriguez — Fabrikam Fintech", time: "1 hr ago", icon: "Calendar" },
  { id: 4, type: "call", text: "AI Call Agent qualified James Wilson (score 82)", time: "2 hrs ago", icon: "Phone" },
  { id: 5, type: "lead", text: "42 new leads discovered in Financial Services", time: "3 hrs ago", icon: "Users" },
  { id: 6, type: "crm", text: "Deal moved to Proposal — Proseware Inc ($48k)", time: "5 hrs ago", icon: "Kanban" },
];

export const recommendations = [
  { id: 1, title: "Follow up with 12 warm leads", desc: "These leads opened your email 3+ times but haven't replied.", action: "Generate follow-ups" },
  { id: 2, title: "Best time to call: 10–11 AM PST", desc: "Your call connect rate is 34% higher in this window.", action: "Schedule calls" },
  { id: 3, title: "Try the 'Executive' tone", desc: "It's converting 22% better for enterprise leads this week.", action: "Apply tone" },
];

export const emails = [
  { id: 1, from: "Sarah Jenkins", subject: "Re: Scaling Acme's outbound in Q1", preview: "This looks promising — can we set up a call next week?", time: "9:24 AM", unread: true, tag: "Reply" },
  { id: 2, from: "Michael Chen", subject: "Northwind × LeadPilot", preview: "Interested, let's talk Thursday. What times work?", time: "8:41 AM", unread: true, tag: "Reply" },
  { id: 3, from: "Campaign: Q1 Enterprise", subject: "Sent to 240 recipients", preview: "Open rate 61% · Reply rate 14%", time: "Yesterday", unread: false, tag: "Campaign" },
  { id: 4, from: "Elena Rodriguez", subject: "Re: Cutting your sales ramp time", preview: "Great, I've booked Thursday at 2 PM.", time: "Yesterday", unread: false, tag: "Reply" },
  { id: 5, from: "James Wilson", subject: "A few questions about pricing", preview: "How does seat-based pricing work for 50+ reps?", time: "Mon", unread: false, tag: "Reply" },
];

export const campaigns = [
  { id: 1, name: "Q1 Enterprise Outbound", status: "Active", sent: 1240, open: 61, reply: 14, meetings: 22 },
  { id: 2, name: "Fintech Founders", status: "Active", sent: 680, open: 58, reply: 19, meetings: 15 },
  { id: 3, name: "SaaS Re-engagement", status: "Paused", sent: 420, open: 44, reply: 8, meetings: 4 },
  { id: 4, name: "Healthcare ICP", status: "Draft", sent: 0, open: 0, reply: 0, meetings: 0 },
];

export const calls = [
  { id: 1, contact: "James Wilson", company: "Contoso Cloud", duration: "6:42", sentiment: "Positive", score: 82, status: "Qualified", time: "Today 10:12 AM" },
  { id: 2, contact: "Priya Patel", company: "Tailspin Toys", duration: "3:18", sentiment: "Neutral", score: 61, status: "Follow-up", time: "Today 9:40 AM" },
  { id: 3, contact: "David Kim", company: "Adventure Works", duration: "8:05", sentiment: "Positive", score: 88, status: "Meeting Booked", time: "Yesterday" },
  { id: 4, contact: "Olivia Brown", company: "Wingtip Media", duration: "2:11", sentiment: "Negative", score: 34, status: "Not Interested", time: "Yesterday" },
];

export const transcript = [
  { speaker: "AI", text: "Hi James, this is Ava from LeadPilot. Is now a good time for a quick chat about your outbound goals?" },
  { speaker: "James", text: "Sure, I have a few minutes. We're struggling to scale personalized outreach." },
  { speaker: "AI", text: "That's exactly what we solve. How large is your SDR team currently?" },
  { speaker: "James", text: "About 8 reps, but ramp time is killing us — 3 months each." },
  { speaker: "AI", text: "We typically cut ramp time by 60%. Could I book you a 20-minute demo Thursday?" },
  { speaker: "James", text: "Yeah, Thursday afternoon works." },
];

export const meetings = [
  { id: 1, title: "Demo — Acme Robotics", with: "Sarah Jenkins", date: "Thu, Jan 18", time: "2:00 PM", type: "Demo" },
  { id: 2, title: "Discovery — Northwind Health", with: "Michael Chen", date: "Thu, Jan 18", time: "4:30 PM", type: "Discovery" },
  { id: 3, title: "Proposal Review — Fabrikam", with: "Elena Rodriguez", date: "Fri, Jan 19", time: "11:00 AM", type: "Proposal" },
  { id: 4, title: "Follow-up — Contoso Cloud", with: "James Wilson", date: "Mon, Jan 22", time: "9:00 AM", type: "Follow-up" },
];

export const pipeline = {
  "New Lead": [
    { id: "d1", company: "Tailspin Toys", value: "$12k", owner: "AI Agent", contact: "Priya Patel" },
    { id: "d2", company: "Wingtip Media", value: "$8k", owner: "AI Agent", contact: "Olivia Brown" },
  ],
  "Contacted": [
    { id: "d3", company: "Adventure Works", value: "$34k", owner: "AI Agent", contact: "David Kim" },
  ],
  "Qualified": [
    { id: "d4", company: "Contoso Cloud", value: "$48k", owner: "AI Agent", contact: "James Wilson" },
    { id: "d5", company: "Northwind Health", value: "$62k", owner: "AI Agent", contact: "Michael Chen" },
  ],
  "Demo": [
    { id: "d6", company: "Acme Robotics", value: "$78k", owner: "AI Agent", contact: "Sarah Jenkins" },
  ],
  "Proposal": [
    { id: "d7", company: "Proseware Inc", value: "$48k", owner: "AI Agent", contact: "Daniel Garcia" },
  ],
  "Negotiation": [
    { id: "d8", company: "Fabrikam Fintech", value: "$96k", owner: "AI Agent", contact: "Elena Rodriguez" },
  ],
  "Won": [
    { id: "d9", company: "Globex Corp", value: "$120k", owner: "AI Agent", contact: "Anna Lee" },
  ],
  "Lost": [
    { id: "d10", company: "Initech", value: "$0", owner: "AI Agent", contact: "Bill Lumbergh" },
  ],
};

export const pipelineStages = ["New Lead", "Contacted", "Qualified", "Demo", "Proposal", "Negotiation", "Won", "Lost"];

export const analyticsSeries = [
  { name: "Mon", open: 52, reply: 12, meetings: 4 },
  { name: "Tue", open: 61, reply: 15, meetings: 6 },
  { name: "Wed", open: 58, reply: 14, meetings: 5 },
  { name: "Thu", open: 67, reply: 19, meetings: 9 },
  { name: "Fri", open: 63, reply: 17, meetings: 7 },
  { name: "Sat", open: 41, reply: 8, meetings: 2 },
  { name: "Sun", open: 38, reply: 6, meetings: 1 },
];

export const revenueSeries = [
  { name: "Jan", value: 42 }, { name: "Feb", value: 58 }, { name: "Mar", value: 71 },
  { name: "Apr", value: 65 }, { name: "May", value: 89 }, { name: "Jun", value: 104 },
  { name: "Jul", value: 128 },
];

export const industrySplit = [
  { name: "SaaS", value: 34 }, { name: "Fintech", value: 26 },
  { name: "Healthcare", value: 21 }, { name: "Retail", value: 19 },
];

// `type` drives the connect flow: "oauth" opens the app to authorize,
// "apikey" asks for a secret key, "webhook" asks for an endpoint URL.
// `authUrl` is the real sign-in / authorize / docs page opened in a new tab.
export const integrations = [
  { name: "Google Workspace", desc: "Email, Calendar & Contacts sync", connected: true, icon: "Chrome", type: "oauth", authUrl: "https://accounts.google.com/", scopes: "Gmail, Calendar, Contacts" },
  { name: "Microsoft 365", desc: "Outlook & Teams integration", connected: true, icon: "Building2", type: "oauth", authUrl: "https://login.microsoftonline.com/", scopes: "Outlook, Teams, Calendar" },
  { name: "Slack", desc: "Real-time deal notifications", connected: true, icon: "Slack", type: "oauth", authUrl: "https://slack.com/signin", scopes: "Channels, Messages" },
  { name: "HubSpot", desc: "Two-way CRM sync", connected: false, icon: "Magnet", type: "oauth", category: "crm", authUrl: "https://app.hubspot.com/login", scopes: "Leads, Contacts, Deals" },
  { name: "Salesforce", desc: "Enterprise CRM sync", connected: false, icon: "Cloud", type: "oauth", category: "crm", authUrl: "https://login.salesforce.com/", scopes: "Leads, Contacts, Deals" },
  { name: "Pipedrive", desc: "Pipeline synchronization", connected: false, icon: "GitBranch", type: "oauth", category: "crm", authUrl: "https://app.pipedrive.com/auth/login", scopes: "Leads, Contacts, Deals" },
  { name: "Zoho", desc: "CRM & workflows", connected: false, icon: "Circle", type: "oauth", category: "crm", authUrl: "https://accounts.zoho.com/signin", scopes: "Leads, Contacts, Deals" },
  { name: "Sangam CRM", desc: "Leads, contacts & deals sync", connected: false, icon: "Database", type: "oauth", category: "crm", authUrl: "https://app.sangamcrm.com/login", scopes: "Leads, Contacts, Deals" },
  { name: "Twilio", desc: "AI phone calls & SMS", connected: true, icon: "Phone", type: "apikey", authUrl: "https://console.twilio.com/", keyLabel: "Auth Token", keyHint: "Find it in Console → Account Info" },
  { name: "OpenAI", desc: "GPT models for generation", connected: true, icon: "Sparkles", type: "apikey", authUrl: "https://platform.openai.com/api-keys", keyLabel: "API Key", keyHint: "Starts with sk-…" },
  { name: "Anthropic", desc: "Claude models", connected: false, icon: "Brain", type: "apikey", authUrl: "https://console.anthropic.com/settings/keys", keyLabel: "API Key", keyHint: "Starts with sk-ant-…" },
  { name: "LinkedIn", desc: "Prospecting & enrichment", connected: true, icon: "Linkedin", type: "oauth", authUrl: "https://www.linkedin.com/login", scopes: "Profile, Connections" },
  { name: "Webhook", desc: "Custom event delivery", connected: false, icon: "Webhook", type: "webhook", authUrl: "https://webhook.site/", keyLabel: "Endpoint URL", keyHint: "We POST events as JSON to this URL" },
];

export const knowledgeDocs = [
  { id: 1, name: "Product Overview.pdf", type: "PDF", size: "2.4 MB", status: "Indexed", date: "Jan 10" },
  { id: 2, name: "Pricing & Packaging.docx", type: "Word", size: "820 KB", status: "Indexed", date: "Jan 09" },
  { id: 3, name: "Competitive Battlecards.pptx", type: "PowerPoint", size: "6.1 MB", status: "Indexed", date: "Jan 08" },
  { id: 4, name: "Sales Playbook 2025.pdf", type: "PDF", size: "3.8 MB", status: "Processing", date: "Jan 12" },
  { id: 5, name: "Demo Recording.mp4", type: "Video", size: "148 MB", status: "Indexed", date: "Jan 05" },
];

export const notifications = [
  { id: 1, text: "Reply received from Sarah Jenkins", time: "2 min ago", type: "reply" },
  { id: 2, text: "Meeting booked — Elena Rodriguez", time: "1 hr ago", type: "meeting" },
  { id: 3, text: "Campaign 'Q1 Enterprise' completed", time: "3 hrs ago", type: "workflow" },
  { id: 4, text: "42 new leads found in Fintech", time: "4 hrs ago", type: "lead" },
];

export const testimonials = [
  { name: "Jordan Meyer", role: "VP Sales, Vertex Labs", quote: "LeadPilot books more meetings than our 6-person SDR team did — while we sleep.", avatar: "https://images.pexels.com/photos/10816007/pexels-photo-10816007.jpeg" },
  { name: "Amara Okafor", role: "CRO, Brightwave", quote: "It researches every account and writes outreach better than most reps. Genuinely feels like hiring an A-player.", avatar: "https://images.pexels.com/photos/12931653/pexels-photo-12931653.jpeg" },
  { name: "Lucas Bianchi", role: "Founder, Cadence.io", quote: "We 3x'd pipeline in 60 days. The AI call agent alone paid for itself in week one.", avatar: "https://images.pexels.com/photos/10816007/pexels-photo-10816007.jpeg" },
];

export const pricing = [
  { name: "Starter", price: "$99", period: "/mo", desc: "For small teams getting started", features: ["500 AI-found leads/mo", "AI email outreach", "Basic CRM sync", "Email support"], cta: "Start Free Trial", popular: false },
  { name: "Growth", price: "$399", period: "/mo", desc: "For scaling sales teams", features: ["5,000 AI-found leads/mo", "AI email + call agents", "Full CRM automation", "Meeting scheduler", "Analytics dashboard", "Priority support"], cta: "Start Free Trial", popular: true },
  { name: "Enterprise", price: "Custom", period: "", desc: "For large organizations", features: ["Unlimited leads", "Dedicated AI employees", "Custom integrations", "SSO & advanced security", "Dedicated success manager", "SLA guarantee"], cta: "Contact Sales", popular: false },
];

export const faqs = [
  { q: "Is LeadPilot AI a CRM?", a: "No. LeadPilot AI is an autonomous AI sales employee that works inside your sales department. It integrates with your existing CRM and handles prospecting, outreach, calls, and follow-ups end-to-end." },
  { q: "How does the AI find leads?", a: "It continuously scans 200M+ company and contact records, applies your ideal customer profile, and surfaces high-intent prospects with verified emails, phone numbers, and enrichment data." },
  { q: "Will the emails sound robotic?", a: "No. Every email is personalized using deep company research and your knowledge base, then tuned to your chosen tone. Recipients consistently rate them as human-written." },
  { q: "Can it really make phone calls?", a: "Yes. The AI Call Agent places natural voice calls, handles objections, qualifies prospects, and books meetings — with full transcripts and sentiment analysis." },
  { q: "How long does setup take?", a: "Most teams are live in under 15 minutes with our guided onboarding. Connect your tools, describe your product, set your goals, and the AI starts working." },
  { q: "Is my data secure?", a: "Absolutely. We're SOC 2 Type II compliant with encryption at rest and in transit, SSO, and granular role-based access controls." },
];

export const features = [
  { icon: "Search", title: "AI Lead Finder", desc: "Discovers high-intent prospects that match your ideal customer profile — automatically." },
  { icon: "Microscope", title: "AI Research Agent", desc: "Researches every company: pain points, tech stack, news, funding, and buying signals." },
  { icon: "Mail", title: "AI Email Agent", desc: "Writes and sends hyper-personalized outreach that reads like your best rep wrote it." },
  { icon: "Phone", title: "AI Call Agent", desc: "Places natural voice calls, handles objections, and qualifies leads in real time." },
  { icon: "CalendarClock", title: "Meeting Scheduler", desc: "Detects time zones, finds slots, and books meetings without the back-and-forth." },
  { icon: "Workflow", title: "CRM Automation", desc: "Keeps every deal, note, and activity updated across your CRM automatically." },
  { icon: "BarChart3", title: "Analytics Dashboard", desc: "Tracks open, reply, and conversion rates with beautiful, actionable insights." },
  { icon: "Brain", title: "Continuous Learning", desc: "Learns from every interaction to improve targeting, messaging, and results over time." },
];

export const workflowSteps = [
  { label: "Find Leads", icon: "Search" },
  { label: "Research", icon: "Microscope" },
  { label: "Email", icon: "Mail" },
  { label: "Call", icon: "Phone" },
  { label: "Book Meeting", icon: "CalendarClock" },
  { label: "Update CRM", icon: "Workflow" },
  { label: "Learn", icon: "Brain" },
];

export const automationNodes = [
  { id: "n1", label: "Find Leads", icon: "Search", x: 40, y: 60 },
  { id: "n2", label: "Research", icon: "Microscope", x: 280, y: 60 },
  { id: "n3", label: "Generate Email", icon: "Sparkles", x: 520, y: 60 },
  { id: "n4", label: "Send Email", icon: "Mail", x: 520, y: 200 },
  { id: "n5", label: "Wait 2 days", icon: "Clock", x: 280, y: 200 },
  { id: "n6", label: "Follow-up", icon: "Repeat", x: 40, y: 200 },
  { id: "n7", label: "AI Call", icon: "Phone", x: 40, y: 340 },
  { id: "n8", label: "Book Meeting", icon: "CalendarClock", x: 280, y: 340 },
  { id: "n9", label: "Update CRM", icon: "Workflow", x: 520, y: 340 },
];
