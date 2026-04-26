import ContentPageLayout from '../components/ContentPageLayout';

const sections = [
  {
    title: 'Purpose of Face Reference Features',
    content: `Cast Director Studio includes reference-guided photo upload and webcam face capture features designed for creative digital double and character likeness workflows.

These features help creators build stronger visual references that guide AI-generated character consistency. The purpose is creative visual alignment — helping AI models produce more repeatable and visually anchored character results.

These features are not designed for identity verification, surveillance, face recognition databases, or biometric profiling.`,
  },
  {
    title: 'How Face Reference Capture Works',
    content: `Photo Upload: Creators can upload source photos to provide face and character reference data. These images serve as visual anchors that help the AI generate more consistent character results.

Webcam Face Capture: Creators can use the guided webcam capture workflow to create face references directly from their webcam. This is designed for creators building digital doubles of themselves or collaborators who have provided consent.

Both methods create creative reference data — visual inputs that guide character generation, not biometric identifiers or identity verification profiles.`,
  },
  {
    title: 'What This Data Is Used For',
    content: `Face reference data is used to:

• Guide AI-generated character consistency across generations
• Improve visual likeness anchoring for digital doubles
• Create character reference foundations for multi-style generation
• Support character sheet and consistency reference outputs

This data is used for creative production purposes only.`,
  },
  {
    title: 'What This Data Is NOT Used For',
    content: `Face reference data is not used for:

• Identity verification or authentication
• Surveillance or monitoring
• Building face recognition databases
• Creating verified identity profiles
• Sharing with law enforcement or government agencies
• Selling to third parties`,
  },
  {
    title: 'Hosted Processing & Temporary Storage',
    content: `When using Hosted Cloud generation mode, reference images and face capture data may be sent to the selected AI processing provider (such as Google Gemini) for AI generation processing. Cast Director Studio does not provide long-term hosted storage for these input or reference images.

Generated output images from Hosted Cloud mode — not including input reference images — are designed for temporary access and automatic deletion after 24 hours.

We do not maintain permanent databases of face reference images. Google's handling of data submitted to Gemini is governed by Google's applicable terms and privacy policies. While we design our systems for timely deletion, we cannot guarantee exact deletion timing due to potential system delays or technical factors.`,
  },
  {
    title: 'BYOK & Local Mode',
    content: `When using BYOK (Bring Your Own Key) mode, reference images and face capture data may be processed through your own AI provider's infrastructure according to their terms and privacy practices.

Local project data, including saved character references, is stored on your local machine. Cast Director Studio does not access or collect local project data from your desktop.`,
  },
  {
    title: 'User Consent & Responsibility',
    content: `You are responsible for ensuring you have the appropriate rights and consent for any images you upload or capture using the App.

If you upload or capture images of other individuals, you must have their informed consent. Do not upload or capture images of individuals who have not consented to their likeness being used for AI character generation.

Cast Director Studio is designed for voluntary, creator-directed use — not for non-consensual image processing.`,
  },
  {
    title: 'No Guarantee of Exact Likeness',
    content: `AI-generated character results are inherently variable. Cast Director Studio does not guarantee exact likeness reproduction, perfect consistency, or identical facial features across generations.

Face reference features are designed to improve visual anchoring and character consistency, but results depend on input quality, reference clarity, AI model behavior, and other factors.`,
  },
  {
    title: 'Applicable Laws',
    content: `Certain jurisdictions have specific laws regarding biometric data and facial imagery processing. We aim to handle face reference data responsibly and in accordance with applicable laws.

If you believe you have specific rights under your jurisdiction's biometric or privacy laws, please contact us at support@castdirectorstudio.com so we can address your request.`,
  },
  {
    title: 'Contact',
    content: `If you have questions about how face reference data is handled, please contact us:

support@castdirectorstudio.com

EZ3D Avatars, LLC`,
  },
];

export default function FaceReference() {
  return (
    <ContentPageLayout title="Face Reference & Biometric Data">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Face Reference & Biometric Data
        </h1>
        <p className="text-sm text-slate-500 mb-2">
          Effective Date: April 2026
        </p>
        <p className="text-slate-400 leading-relaxed max-w-3xl">
          This page explains how Cast Director Studio handles face reference
          images, webcam face capture data, and related biometric considerations
          in the context of creative digital double workflows.
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
          Last updated: April 2026. For questions about this policy, contact
          support@castdirectorstudio.com.
        </p>
      </div>
    </ContentPageLayout>
  );
}
