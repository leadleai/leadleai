# LeadPilot AI — PRD

## Problem Statement
Premium, production-ready SaaS frontend "LeadPilot AI" — an Autonomous AI Sales Employee (finds leads, researches, emails, calls, books meetings, updates CRM, analytics, learns). Design inspired by Linear/Stripe/Notion AI/OpenAI. White light theme with dark-mode toggle. Stack: React + Tailwind + shadcn/ui + Framer Motion + Lucide.

## User Choices
- Build ALL pages listed
- ALL buttons functional (navigation, local-state, toasts) — data actions mocked
- White theme + built dark-mode toggle
- Premium fonts (Outfit headings / Inter body)
- FRONTEND-ONLY, realistic mock data, no backend/integrations

## Architecture
- Frontend-only. No backend used. Mock data in `src/lib/mockData.js`.
- Theme via `src/lib/theme.jsx` (class-based dark mode, localStorage).
- Routes in `src/App.js`. Dashboard pages under `/app` via `DashboardLayout.jsx`.
- Shared UI: `src/components/shared/Primitives.jsx` (PageHeader, StatCard, EmptyState).

## Implemented (Dec 2025)
- Landing: hero + animated workflow + features + testimonials + pricing + FAQ + footer + dark toggle
- Auth: Login (+2FA OTP + social), Signup, Forgot Password
- Onboarding: 4-step wizard
- App: Dashboard, Leads (table+filters+bulk), Research, Campaigns, Emails (studio+tone+A/B), Calls (waveform+transcript), Meetings (calendar), CRM (kanban drag-drop), Analytics (charts), Automation (node canvas), Knowledge Base (ask AI), Integrations (toggles), Settings (tabs+danger zone)
- Layout: sidebar, top navbar (search/command palette, notifications, theme, profile), floating AI Assistant
- Tested: testing_agent iteration_1 → 100% frontend, no bugs.

## Backlog / Next
- P1: Wire to real backend + AI (Emergent LLM key) for actual lead gen/email drafting
- P2: Persist onboarding/settings; real auth
- P2: Real drag-drop lib polish, CSV export

## Update (Dec 2025) — Landing Audit & Missing Pages
- Extracted shared MarketingNav (mobile hamburger + smooth-scroll, cross-page hash nav) and MarketingFooter (all links wired — no dead links).
- New pages: /pricing, /contact (validated form + loading + success), /privacy, /terms, /cookies, and 404 catch-all (*).
- Wired every CTA/footer/pricing link to correct destination; Enterprise CTA -> /contact.
- Added form validation + loading spinners to Login (+2FA), Signup, Forgot Password, Contact.
- Global smooth scrolling + scroll-mt offsets on anchored sections.
- Verified: testing_agent iteration_2 -> 100% frontend, zero dead links, no bugs.
