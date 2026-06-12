import ContentPageLayout from '../components/ContentPageLayout';

const sections = [
  {
    title: 'Purpose of Reference Features',
    content: `Cast Director Studio includes reference-guided photo upload and webcam capture features designed for creative visual foundation workflows.

These features help creators build stronger visual anchors for themselves, clients, spokespeople, characters, and brand personalities. The purpose is creative direction, helping communicate visual intent to AI generation workflows.

These features are not designed for identity verification, surveillance, face recognition databases, biometric profiling, or guaranteed face cloning.`,
  },
  {
    title: 'How Reference Capture Works',
    content: `Photo Upload: Creators can upload source photos to provide visual reference data. These images serve as creative anchors that help guide style, likeness direction, and visual intent.

Webcam Capture: Creators can use the guided webcam capture workflow to create reference inputs directly from their webcam. This is designed for voluntary creator-directed digital double and visual foundation workflows.

Both methods create creative reference data, not biometric identifiers or identity verification profiles.`,
  },
  {
    title: 'What This Data Is Used For',
    content: `Reference data is used to:

- Build stronger visual anchors for AI generation
- Support creative digital double workflows
- Provide reference foundations for multi-style generation
- Support production reference sheets and downstream creative workflows

This data is used for creative production purposes only.`,
  },
  {
    title: 'What This Data Is NOT Used For',
    content: `Reference data is not used for:

- Identity verification or authentication
- Surveillance or monitoring
- Building face recognition databases
- Creating verified identity profiles
- Sharing with law enforcement or government agencies
- Selling to third parties`,
  },
  {
    title: 'Hosted Processing & Temporary Storage',
    content: `When using Hosted Cloud generation mode, reference images and capture data may be sent to the selected AI processing provider, such as Google Gemini, for AI generation processing. Cast Director Studio does not provide long-term hosted storage for these input or reference images.

Generated output images from Hosted Cloud mode, not including input reference images, may be temporarily hosted for delivery to the desktop client.

Google's handling of data submitted to Gemini is governed by Google's applicable terms and privacy policies.`,
  },
  {
    title: 'BYOK & Local Mode',
    content: `When using BYOK (Bring Your Own Key) mode, reference images and capture data may be processed through your own AI provider's infrastructure according to their terms and privacy practices.

Local project data, including saved references and generated assets, is stored on your local machine. Cast Director Studio does not access or collect local project data from your desktop.`,
  },
  {
    title: 'User Consent & Responsibility',
    content: `You are responsible for ensuring you have the appropriate rights and consent for any images you upload or capture using the App.

If you upload or capture images of other individuals, you must have their informed consent. Do not upload or capture images of individuals who have not consented to their likeness being used for AI creative generation.

Cast Director Studio is designed for voluntary, creator-directed use, not for non-consensual image processing.`,
  },
  {
    title: 'No Guarantee of Exact Likeness',
    content: `AI-generated results are inherently variable. Cast Director Studio does not guarantee exact likeness reproduction, perfect consistency, or identical facial features across generations.

Reference features are designed to provide stronger visual anchors and reduce creative friction, but results depend on input quality, reference clarity, AI model behavior, settings, and other factors.`,
  },
  {
    title: 'Applicable Laws',
    content: `Certain jurisdictions have specific laws regarding biometric data and facial imagery processing. We aim to handle reference data responsibly and in accordance with applicable laws.

If you believe you have specific rights under your jurisdiction's biometric or privacy laws, please contact us at support@castdirectorstudio.com so we can address your request.`,
  },
  {
    title: 'Contact',
    content: `If you have questions about how reference data is handled, please contact us:

support@castdirectorstudio.com

EZ3D Avatars, LLC`,
  },
];

export default function FaceReference() {
  return (
    <ContentPageLayout title="Reference & Biometric Data">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Reference & Biometric Data
        </h1>
        <p className="text-sm text-slate-500 mb-2">
          Effective Date: April 2026
        </p>
        <p className="text-slate-400 leading-relaxed max-w-3xl">
          This page explains how Cast Director Studio handles reference images,
          webcam capture data, and related biometric considerations in the
          context of creative visual foundation workflows.
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
