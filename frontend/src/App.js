import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider } from "@/lib/auth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Toaster } from "@/components/ui/sonner";

import Landing from "@/pages/Landing";
import Enquiry from "@/pages/Enquiry";
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import Onboarding from "@/pages/Onboarding";
import Demo from "@/pages/Demo";
import Pricing from "@/pages/Pricing";
import Contact from "@/pages/Contact";
import Features from "@/pages/Features";
import HowItWorks from "@/pages/HowItWorks";
import FAQ from "@/pages/FAQ";
import About from "@/pages/About";
import Careers from "@/pages/Careers";
import Blog from "@/pages/Blog";
import Security from "@/pages/Security";
import Privacy from "@/pages/legal/Privacy";
import Terms from "@/pages/legal/Terms";
import CookiePolicy from "@/pages/legal/CookiePolicy";
import NotFound from "@/pages/NotFound";
import DashboardLayout from "@/components/layout/DashboardLayout";

import Dashboard from "@/pages/app/Dashboard";
import Leads from "@/pages/app/Leads";
import LeadDetail from "@/pages/app/LeadDetail";
import Campaigns from "@/pages/app/Campaigns";
import Emails from "@/pages/app/Emails";
import Calls from "@/pages/app/Calls";
import Meetings from "@/pages/app/Meetings";
import Analytics from "@/pages/app/Analytics";
import Automation from "@/pages/app/Automation";
import KnowledgeBase from "@/pages/app/KnowledgeBase";
import Integrations from "@/pages/app/Integrations";
import Settings from "@/pages/app/Settings";
import Team from "@/pages/app/Team";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <div className="App">
        <BrowserRouter>
          <Routes>
            {/* ── Public ─────────────────────────────────────────────── */}
            <Route path="/" element={<Landing />} />
            {/* Enquiry forms stay open to the world. The optional :slug picks
                which organization the lead is filed under. */}
            <Route path="/enquiry" element={<Enquiry />} />
            <Route path="/enquiry/:slug" element={<Enquiry />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/features" element={<Features />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/about" element={<About />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/security" element={<Security />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/cookies" element={<CookiePolicy />} />
            {/* ── Everything below requires a session ─────────────────── */}
            <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="team" element={<Team />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="emails" element={<Emails />} />
              <Route path="calls" element={<Calls />} />
              <Route path="meetings" element={<Meetings />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="automation" element={<Automation />} />
              <Route path="knowledge" element={<KnowledgeBase />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </div>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
