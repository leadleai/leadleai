import MarketingPage, { LegalBody } from "@/components/marketing/MarketingPage";

const sections = [
  { h: "1. Acceptance of Terms", p: "By accessing or using LeadPilot AI, you agree to be bound by these Terms of Service. If you do not agree, you may not use the service." },
  { h: "2. Description of Service", p: "LeadPilot AI provides an autonomous AI sales platform that finds leads, researches accounts, generates outreach, and automates sales workflows. Features may change or be updated over time." },
  { h: "3. Account Responsibilities", p: "You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. You must provide accurate information and comply with applicable laws, including anti-spam regulations (CAN-SPAM, GDPR)." },
  { h: "4. Acceptable Use", p: "You agree not to use the service for unlawful, deceptive, or abusive outreach, to send unsolicited bulk messages in violation of law, or to reverse-engineer the platform." },
  { h: "5. Subscriptions & Billing", p: "Paid plans are billed in advance on a recurring basis. You may cancel at any time; cancellations take effect at the end of the current billing period. Fees are non-refundable except as required by law." },
  { h: "6. Intellectual Property", p: "LeadPilot AI and its underlying technology are owned by us. You retain ownership of the data and content you upload, and grant us a license to process it to provide the service." },
  { h: "7. Limitation of Liability", p: "The service is provided 'as is'. To the maximum extent permitted by law, LeadPilot AI is not liable for indirect, incidental, or consequential damages arising from your use of the service." },
  { h: "8. Termination", p: "We may suspend or terminate your access for violations of these terms. You may terminate your account at any time from Settings." },
];

export default function Terms() {
  return (
    <MarketingPage title="Terms of Service" subtitle="The rules and guidelines for using LeadPilot AI." testid="terms-page">
      <LegalBody sections={sections} updated="January 1, 2025" />
    </MarketingPage>
  );
}
