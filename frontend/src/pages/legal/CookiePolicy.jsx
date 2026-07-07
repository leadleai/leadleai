import MarketingPage, { LegalBody } from "@/components/marketing/MarketingPage";

const sections = [
  { h: "1. What Are Cookies", p: "Cookies are small text files stored on your device that help websites remember your preferences and understand how you use the site." },
  { h: "2. Essential Cookies", p: "These are necessary for the platform to function — including authentication, session management, and security. They cannot be disabled." },
  { h: "3. Analytics Cookies", p: "We use analytics cookies to understand how users interact with LeadPilot AI so we can improve the experience. These collect aggregated, anonymized usage data." },
  { h: "4. Preference Cookies", p: "These remember your settings, such as light/dark theme and language, to personalize your experience." },
  { h: "5. Managing Cookies", p: "You can control and delete cookies through your browser settings. Disabling essential cookies may impact the functionality of the service." },
  { h: "6. Third-Party Cookies", p: "Some integrations you connect may set their own cookies governed by their respective privacy policies." },
];

export default function CookiePolicy() {
  return (
    <MarketingPage title="Cookie Policy" subtitle="How and why we use cookies on LeadPilot AI." testid="cookies-page">
      <LegalBody sections={sections} updated="January 1, 2025" />
    </MarketingPage>
  );
}
