import ContentPageLayout from '../components/ContentPageLayout';

const sections = [
  {
    title: '1. Acceptance of Terms',
    content: `By accessing or using Cast Director Studio ("the App," "the Service"), you agree to these Terms of Service. If you do not agree, do not use the Service.

These terms apply to all users of the App, including desktop application users, Hosted Cloud users, and BYOK (Bring Your Own Key) users.`,
  },
  {
    title: '2. Product Description',
    content: `Cast Director Studio is a desktop AI creative tool that helps users create reusable AI actors, direct subject lighting, control wardrobe and props, compose scenes, and generate character sheets and AI-generated images.

The App provides guided creative controls designed to reduce prompt trial-and-error and improve character consistency across generated outputs.`,
  },
  {
    title: '3. Account & License Access',
    content: `Certain features of the App require an account and a valid license. You are responsible for maintaining the security of your account credentials.

License terms, including usage limits and permitted use, are defined by the plan you purchase. Licenses are non-transferable unless otherwise stated.`,
  },
  {
    title: '4. Hosted Cloud & BYOK Usage',
    content: `Hosted Cloud: When using Hosted Cloud generation, prompts, configuration settings, and reference images are sent to the selected AI processing provider (such as Google Gemini) for generation. Cast Director Studio does not provide long-term hosted storage for input or reference images. Generated output images may be temporarily hosted by Cast Director Studio for delivery and download, and are designed to auto-delete after 24 hours. Google's handling of data submitted to Gemini is governed by Google's applicable terms and privacy policies.

BYOK (Bring Your Own Key): When using BYOK mode, you connect your own AI provider API key. You are solely responsible for your API key security, provider terms of service, and any costs incurred through your provider. Cast Director Studio does not control or guarantee BYOK provider behavior.`,
  },
  {
    title: '5. User Responsibility for Prompts, References & Outputs',
    content: `You are responsible for all content you create, upload, or generate using the App. This includes prompts, reference images, uploaded photos, webcam captures, and all AI-generated outputs.

You must have the legal right and appropriate consent to use any reference images or source photos you upload or capture. Do not upload or capture images of individuals without their consent.`,
  },
  {
    title: '6. User Content Ownership & Responsibility',
    content: `You retain ownership of the content you create using the App, subject to applicable AI provider terms and any third-party rights.

Cast Director Studio does not claim ownership of your generated outputs. However, we make no guarantees regarding copyright status, legal clearance, or commercial usability of AI-generated content. You are responsible for determining the appropriate use of your outputs.`,
  },
  {
    title: '7. Prohibited Use',
    content: `You may not use the App for any unlawful, infringing, harmful, or abusive purpose. This includes but is not limited to:

• Creating content that infringes on others' intellectual property rights
• Generating content depicting minors in inappropriate contexts
• Creating deceptive deepfakes intended to mislead, defraud, or harm
• Using the App for surveillance, identity verification, or non-consensual tracking
• Attempting to reverse engineer, exploit, or disrupt the Service
• Violating any applicable laws or regulations`,
  },
  {
    title: '8. Payments, Subscriptions & Refunds',
    content: `Payment is processed through our third-party payment processor at checkout. Subscription terms, renewal schedules, and refund eligibility are defined at the time of purchase and are subject to the checkout terms presented.

Cast Director Studio reserves the right to change pricing and plan structures. Changes will not retroactively affect existing paid subscription periods.`,
  },
  {
    title: '9. Credits for Hosted Generations',
    content: `Hosted Cloud plans include credits for AI generations. Credit usage varies by generation type, resolution, and complexity. Credits are consumed when a hosted generation request is submitted and processed.

Unused credits do not roll over between billing periods unless otherwise stated in your plan terms. Additional credit packs may be available for purchase.`,
  },
  {
    title: '10. BYOK Responsibility',
    content: `BYOK users connect their own AI provider API keys. Cast Director Studio is not responsible for:

• Costs incurred through your AI provider
• Changes to your provider's terms of service, pricing, or API availability
• Security of your API key (you are responsible for keeping it secure)
• Output quality or consistency from your provider's models`,
  },
  {
    title: '11. Temporary Hosted Storage',
    content: `Generated output images from Hosted Cloud mode are designed for temporary access and automatic deletion after 24 hours. This 24-hour temporary hosting and deletion applies only to generated output images — not to input or reference images, which are sent to the AI processing provider for generation and are not stored long-term by Cast Director Studio.

You are responsible for downloading and saving generated output assets during your session. Lost or expired hosted assets may not be recoverable.`,
  },
  {
    title: '12. No Guarantee of Outputs',
    content: `AI-generated outputs are inherently variable. Cast Director Studio does not guarantee:

• Perfect character consistency across all generations
• Exact likeness reproduction from reference images
• Copyright clearance or legal usability of generated content
• Fitness for any specific commercial or legal purpose

The App provides directed controls designed to improve consistency and quality, but results depend on many factors including input quality, prompt direction, and AI model behavior.`,
  },
  {
    title: '13. AI Output Limitations',
    content: `AI models may produce unexpected, inaccurate, or unintended results. Generated content may contain artifacts, inconsistencies, or unintended visual elements.

Cast Director Studio does not control the underlying AI model behavior and cannot guarantee specific outcomes. Users should review all generated content before use.`,
  },
  {
    title: '14. Service Changes',
    content: `Cast Director Studio reserves the right to modify, update, or discontinue features of the Service at any time. We will make reasonable efforts to communicate significant changes through the App or our communication channels.`,
  },
  {
    title: '15. Termination',
    content: `We may suspend or terminate your access to the Service if you violate these Terms, engage in prohibited use, or if continued access poses a risk to the Service or other users.

You may cancel your account at any time through your account settings. Cancellation does not entitle you to a refund for the current billing period unless otherwise stated.`,
  },
  {
    title: '16. Disclaimers',
    content: `The Service is provided "as is" and "as available" without warranties of any kind, express or implied. Cast Director Studio disclaims all warranties including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, and non-infringement.

We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components.`,
  },
  {
    title: '17. Limitation of Liability',
    content: `To the maximum extent permitted by applicable law, Cast Director Studio and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.

Our total liability for any claim arising from these Terms or the Service shall not exceed the amount you paid for the Service in the twelve months preceding the claim.`,
  },
  {
    title: '18. Contact',
    content: `If you have questions about these Terms of Service, please contact us:

support@castdirectorstudio.com

EZ3D Avatars, LLC`,
  },
];

export default function Terms() {
  return (
    <ContentPageLayout title="Terms of Service">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-500 mb-2">
          Effective Date: April 2026
        </p>
        <p className="text-slate-400 leading-relaxed max-w-3xl">
          Please read these Terms of Service carefully before using Cast Director
          Studio. By using the App, you agree to be bound by these terms.
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
          Last updated: April 2026. For questions about these Terms, contact
          support@castdirectorstudio.com.
        </p>
      </div>
    </ContentPageLayout>
  );
}
