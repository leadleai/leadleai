import MarketingPage, { LegalBody } from "@/components/marketing/MarketingPage";

const sections = [
  { h: "1. Information We Collect", p: "We collect information you provide directly (account details, company data, and content you upload) as well as usage data generated when you interact with LeadPilot AI. This includes email addresses, prospect data you import, and integration credentials you connect." },
  { h: "2. How We Use Your Information", p: "We use your information to provide and improve the service, personalize AI-generated outreach, power analytics, and communicate with you. We never sell your data to third parties." },
  { h: "3. Data Sharing", p: "We share data only with sub-processors necessary to operate the service (e.g., cloud hosting, email delivery) under strict data processing agreements, and when required by law." },
  { h: "4. Data Security", p: "We are SOC 2 Type II compliant. All data is encrypted in transit (TLS 1.2+) and at rest (AES-256). Access is governed by role-based permissions and audited regularly." },
  { h: "5. Your Rights", p: "You may access, correct, export, or delete your personal data at any time. To exercise these rights, contact privacy@leadpilot.ai. EU/UK residents have additional rights under GDPR." },
  { h: "6. Data Retention", p: "We retain your data for as long as your account is active. Upon deletion, data is permanently removed within 30 days, except where retention is legally required." },
  { h: "7. Changes to This Policy", p: "We may update this policy periodically. Material changes will be communicated via email or an in-app notice at least 14 days before taking effect." },
];

export default function Privacy() {
  return (
    <MarketingPage title="Privacy Policy" subtitle="How we collect, use, and protect your data." testid="privacy-page">
      <LegalBody sections={sections} updated="January 1, 2025" />
    </MarketingPage>
  );
}
