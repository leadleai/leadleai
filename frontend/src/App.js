import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";

import Landing from "@/pages/Landing";
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import Onboarding from "@/pages/Onboarding";
import Pricing from "@/pages/Pricing";
import Contact from "@/pages/Contact";
import Privacy from "@/pages/legal/Privacy";
import Terms from "@/pages/legal/Terms";
import CookiePolicy from "@/pages/legal/CookiePolicy";
import NotFound from "@/pages/NotFound";
import DashboardLayout from "@/components/layout/DashboardLayout";

import Dashboard from "@/pages/app/Dashboard";
import Leads from "@/pages/app/Leads";
import Research from "@/pages/app/Research";
import Campaigns from "@/pages/app/Campaigns";
import Emails from "@/pages/app/Emails";
import Calls from "@/pages/app/Calls";
import Meetings from "@/pages/app/Meetings";
import CRM from "@/pages/app/CRM";
import Analytics from "@/pages/app/Analytics";
import Automation from "@/pages/app/Automation";
import KnowledgeBase from "@/pages/app/KnowledgeBase";
import Integrations from "@/pages/app/Integrations";
import Settings from "@/pages/app/Settings";

function App() {
  return (
    <ThemeProvider>
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/cookies" element={<CookiePolicy />} />
            <Route path="/app" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="leads" element={<Leads />} />
              <Route path="research" element={<Research />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="emails" element={<Emails />} />
              <Route path="calls" element={<Calls />} />
              <Route path="meetings" element={<Meetings />} />
              <Route path="crm" element={<CRM />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="automation" element={<Automation />} />
              <Route path="knowledge" element={<KnowledgeBase />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </div>
    </ThemeProvider>
  );
}

export default App;
