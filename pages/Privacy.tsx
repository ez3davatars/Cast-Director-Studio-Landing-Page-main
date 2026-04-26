import ContentPageLayout from '../components/ContentPageLayout';

const sections = [
  {
    title: '1. Information We Collect',
    content: `When you use Cast Director Studio, we may collect the following types of information:

Account Information: Name, email address, and account credentials when you create an account.

Payment Information: Payment is processed by our third-party payment processor. We do not directly store credit card numbers or full payment details. We may receive transaction confirmations, plan type, and billing status from our payment processor.

Product Usage Data: General usage data related to your use of the App, such as feature usage, generation counts, and session information. This helps us improve the product and support experience.

Input & Reference Images: When you use AI generation features, uploaded images, reference images, webcam captures, prompts, and related generation settings may be sent to the selected AI processing provider, such as Google Gemini, to generate the requested output. Cast Director Studio does not provide long-term hosted storage for these input images. Google's handling of data submitted to Gemini is governed by Google's applicable terms and privacy policies.

Generated Images: Images generated through Hosted Cloud mode may be temporarily hosted by Cast Director Studio for delivery and download. These generated outputs are designed to automatically delete after 24 hours, so users should save any files they want to keep.

Support Communications: If you contact us for support, we collect the content of your communications including email address, name, and message content.`,
  },
  {
    title: '2. How We Use Your Information',
    content: `We use collected information to:

• Provide, maintain, and improve the Service
• Process generations and deliver results
• Manage your account, license, and subscription
• Process payments through our payment processor
• Respond to support inquiries
• Send transactional communications (purchase confirmations, account updates)
• Analyze usage patterns to improve the product
• Enforce our Terms of Service`,
  },
  {
    title: '3. Hosted Cloud vs. Local / BYOK',
    content: `Hosted Cloud Mode: When using Hosted Cloud generation, your prompts, configuration settings, and reference images are sent to the selected AI processing provider (such as Google Gemini) for generation. Cast Director Studio does not provide long-term hosted storage for input images or reference images. Generated output images may be temporarily hosted by Cast Director Studio for delivery and download.

BYOK / Local Mode: When using BYOK mode, generation requests are routed through your own AI provider API key. Cast Director Studio does not process or store BYOK generation requests on our infrastructure — they are sent directly to your configured provider.

Local Project Data: Cast Director Studio provides a desktop-first workspace. Project files and creative assets are managed locally through the desktop application. We do not routinely access or collect local project data.`,
  },
  {
    title: '4. Temporary Hosted Storage & 24-Hour Deletion',
    content: `Generated output images from Hosted Cloud mode are designed for temporary access and automatic deletion after 24 hours. This 24-hour temporary hosting and deletion applies only to generated output images — not to input or reference images, which are sent to the AI processing provider for generation and are not stored long-term by Cast Director Studio.

We do not guarantee indefinite storage of hosted output assets. You should download and save important outputs during your session.

While we design our systems for timely deletion, we cannot guarantee exact deletion timing due to potential system delays or technical factors. Google's handling of data submitted to Gemini is governed by Google's applicable terms and privacy policies.`,
  },
  {
    title: '5. Cookies & Analytics',
    content: `We may use cookies or similar technologies to maintain session state, remember preferences, and support basic analytics.

If we use analytics tools, they may collect general usage data such as page visits, session duration, and feature usage. We aim to use privacy-respecting analytics practices where possible.`,
  },
  {
    title: '6. Data Sharing with Service Providers',
    content: `We may share information with trusted third-party service providers who assist us in operating the Service. These providers may include:

• Hosting and infrastructure providers
• Payment processing providers
• Email and communication providers
• Database and storage providers
• AI processing providers (for hosted generation)
• Analytics providers

We require service providers to handle your information in accordance with their privacy policies and applicable law. We do not sell your personal information.`,
  },
  {
    title: '7. Data Security',
    content: `We implement reasonable technical and organizational measures to protect your information. However, no system is completely secure, and we cannot guarantee absolute security of your data.

You are responsible for maintaining the security of your account credentials and, if using BYOK mode, your API keys.`,
  },
  {
    title: '8. Your Choices',
    content: `Account Information: You can update your account information through your account settings.

Communications: You can manage email preferences through your account settings or by following unsubscribe instructions in our emails.

Account Deletion: You can request account deletion by contacting support@castdirectorstudio.com. Account deletion will remove your account data from our active systems, subject to any legal retention requirements.

Data Access: You may contact us to request information about the data we hold about you.`,
  },
  {
    title: '9. Children\'s Privacy',
    content: `Cast Director Studio is not intended for use by individuals under the age of 18. We do not knowingly collect information from children. If we become aware that we have collected information from a child, we will take steps to delete it.`,
  },
  {
    title: '10. Changes to This Policy',
    content: `We may update this Privacy Policy from time to time. We will post updated versions on this page and update the effective date. Continued use of the Service after changes constitutes acceptance of the updated policy.`,
  },
  {
    title: '11. Contact',
    content: `If you have questions about this Privacy Policy or our data practices, please contact us:

support@castdirectorstudio.com

EZ3D Avatars, LLC`,
  },
];

export default function Privacy() {
  return (
    <ContentPageLayout title="Privacy Policy">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500 mb-2">
          Effective Date: April 2026
        </p>
        <p className="text-slate-400 leading-relaxed max-w-3xl">
          This Privacy Policy explains what information Cast Director Studio
          collects, how we use it, and your choices regarding your data.
        </p>
      </div>

      <div className="space-y-12">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="font-display text-xl font-bold text-white mb-3">
              {s.title}
            </h2>
            <div className="text-[15px] leading-relaxed text-slate-400 whitespace-pre-line">
              {s.content}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-16 p-6 rounded-2xl border border-white/[0.04] bg-white/[0.02]">
        <p className="text-xs text-slate-500 leading-relaxed">
          Last updated: April 2026. For questions about this Privacy Policy,
          contact support@castdirectorstudio.com.
        </p>
      </div>
    </ContentPageLayout>
  );
}
