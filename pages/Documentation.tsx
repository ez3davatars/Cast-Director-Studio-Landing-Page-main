import ContentPageLayout from '../components/ContentPageLayout';

const sections = [
  {
    title: 'What Is Cast Director Studio?',
    content: `Cast Director Studio is a desktop AI creative tool designed for AI content creators, filmmakers, illustrators, and visual storytellers. It helps you create consistent AI characters faster by giving you directed creative controls instead of relying on prompt trial-and-error.

Rather than re-describing a character from scratch every time, you build reusable AI actors with guided controls for face references, subject lighting, wardrobe, props, and scenes — then generate consistent results across multiple visual styles.`,
  },
  {
    title: 'Who Is It For?',
    content: `Cast Director Studio is built for creators who need repeatable, consistent AI-generated characters and scenes. This includes AI content creators, YouTubers, filmmakers, animators, brand designers, game concept artists, illustrators, and anyone working with AI-generated imagery in a production or creative workflow.

Whether you are building a cast of characters for a web series, designing product visuals with AI models, or creating concept art across multiple visual styles — Cast Director Studio is designed to help you move faster with more control.`,
  },
  {
    title: 'Core Workflow',
    content: `The typical Cast Director Studio workflow follows five steps:

1. Add reference photos or start from scratch — define your character direction across five visual styles.
2. Build a reusable AI actor with reference-guided identity capture.
3. Direct subject lighting, wardrobe, props, and scene with guided creative controls.
4. Generate cinematic variations with less prompt overhead.
5. Export character sheets and consistency references — ready for production.

This directed approach reduces the cycle of re-prompting, re-describing, and re-adjusting that slows down prompt-only workflows.`,
  },
  {
    title: 'Reusable AI Actors',
    content: `AI actors are your reusable character foundations. Instead of writing a detailed character prompt every time, you build a visual identity once and reuse it across generations.

Each AI actor stores face references, visual style preferences, and character direction — so you can generate new scenes, outfits, and compositions without losing the character's visual consistency.

Your cast is not limited to people. You can build actors from humans, animals, mascots, stylized characters, anime characters, sci-fi characters, illustrated characters, and brand-driven digital subjects.`,
  },
  {
    title: 'Reference-Guided Photo Upload & Webcam Face Capture',
    content: `Cast Director Studio supports two methods for creating stronger character references:

Photo Upload: Upload source photos to create face and character references that guide the AI toward more consistent results.

Webcam Face Capture: Use the guided webcam capture workflow to build face references directly from your webcam. This is designed for creators building digital doubles of themselves or collaborators.

Both methods create visual reference anchors — they are designed for creative character likeness workflows, not identity verification or surveillance. No biometric profiles are stored. The purpose is creative visual alignment for more repeatable AI-generated characters.`,
  },
  {
    title: 'Production-Ready Subject Lighting',
    content: `Subject lighting is one of the most common points of failure in AI image generation. A character may look great in one prompt, but changing the scene, wardrobe, or angle often breaks the lighting.

Cast Director Studio provides directed lighting controls designed to maintain clean, consistent illumination on the subject across different compositions and scenes. The goal is production-ready results that look intentional rather than randomly lit.`,
  },
  {
    title: 'Wardrobe, Props & Scene Direction',
    content: `Instead of embedding wardrobe and prop descriptions into long prompts, Cast Director Studio provides guided controls for:

Wardrobe: Direct clothing, outfits, and accessories with visual references.
Props: Add and position objects the character interacts with.
Scenes: Control backgrounds, environments, and composition context.

These controls carry across visual styles — so you can switch between photorealistic, stylized cartoon, anime, illustration, and sci-fi directions without re-prompting wardrobe and scene details.`,
  },
  {
    title: 'Character Sheets & Consistency References',
    content: `Character sheets are structured visual outputs that capture a character's identity across multiple angles, expressions, and configurations.

Use character sheets as reference inputs for downstream tools — video AI pipelines, animation workflows, illustration systems, or any generative tool that benefits from structured visual references.

Character sheet outputs include multi-angle refs, expression maps, wardrobe sheets, style guides, and lighting profiles.`,
  },
  {
    title: 'Hosted Cloud vs. BYOK (Bring Your Own Key)',
    content: `Cast Director Studio supports two generation modes:

Hosted Cloud: Generations consume credits from your plan. Prompts, configuration settings, and reference images are sent to the selected AI processing provider (such as Google Gemini) for generation. Generated output images may be temporarily hosted by Cast Director Studio for delivery and download, and are designed to auto-delete after 24 hours.

BYOK (Bring Your Own Key): Connect your own AI provider API key and run generations through your own account. You are responsible for your API key security and provider costs. BYOK mode may offer more flexibility for high-volume creators.

Both modes use the same creative controls and workflow — the difference is where the AI generation runs and how costs are handled.`,
  },
  {
    title: 'AI Model Support & Future Providers',
    content: `Cast Director Studio is designed as a provider-aware creative workflow. Image generation is handled by the selected AI processing provider, such as Google Gemini. The creative direction system — reusable AI actors, subject lighting, wardrobe, character sheets, and scene controls — is designed to work across model capabilities as they evolve.

As new model options become available, additional provider support may be evaluated where API access, quality, pricing, and product fit make sense. Model families such as Google Gemini / Nano Banana, OpenAI GPT Image, and xAI Grok Imagine may be evaluated as APIs, model capabilities, and creator needs evolve.

Cast Director Studio does not guarantee support for every model or provider. Our focus is supporting the generators that best serve serious avatar, character, and AI content workflows.`,
  },
  {
    title: 'Credits & Generation Usage',
    content: `Managed API generations consume credits from your plan. Each plan includes a set number of monthly credits, and additional credit packs are available for purchase inside your account dashboard.

Generation Credits are pegged to render size:

• Standard 1K Generation: 1 Credit
• 2K Widescreen or Character Sheet: 2 Credits
• Ultra-High 4K Generation: 6 Credits

The pricing page on the site lists current plan options and credit allocations.

BYOK users do not consume Cast Director Studio credits — they use their own API key and are billed directly by their AI provider.`,
  },
  {
    title: 'Local Desktop Workflow',
    content: `Cast Director Studio provides the creative workspace and direction system for building AI actors, references, character assets, and visual workflows.

When Hosted Cloud mode is used, generation requests are processed through the selected AI provider, such as Google Gemini. BYOK mode routes requests through your own AI provider API key. Account and license information may also sync with Cast Director Studio services.

Completed generated outputs from Hosted Cloud mode may be temporarily delivered through Cast Director Studio and are designed to automatically delete after 24 hours.`,
  },
  {
    title: 'Hosted Image Availability & 24-Hour Deletion',
    content: `When using Hosted Cloud generation, generated output images are temporarily hosted by Cast Director Studio for delivery to your desktop client. This 24-hour temporary hosting and deletion applies only to generated output images — not to input or reference images, which are sent to the AI processing provider for generation and are not stored long-term by Cast Director Studio.

Generated output images are designed for temporary access and automatic deletion after 24 hours. This means generated images should be downloaded and saved locally during your session.

Cast Director Studio does not guarantee indefinite storage of hosted generation results. Always save important outputs to your local project.`,
  },
  {
    title: 'Troubleshooting Basics',
    content: `Common issues and quick solutions:

Generation not starting: Check your internet connection and verify your license or credits are active in your account dashboard.

Results look inconsistent: Make sure you have uploaded clear reference photos and selected the appropriate visual style.

Download not completing: Hosted assets are available for 24 hours. If a download fails, try regenerating or contact support.

BYOK errors: Verify your API key is valid and has sufficient balance with your provider.

App not launching: Ensure your system meets the minimum requirements and try restarting the application.

For additional help, reach out to support@castdirectorstudio.com.`,
  },
];

export default function Documentation() {
  return (
    <ContentPageLayout title="Documentation">
      {/* Page header */}
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Documentation
        </h1>
        <p className="text-lg text-slate-300 leading-relaxed max-w-3xl">
          Everything you need to know about Cast Director Studio — how it works,
          what it does, and how to get the most out of your creative workflow.
        </p>
      </div>

      {/* Table of contents */}
      <nav className="mb-16 p-6 rounded-2xl border border-white/[0.04] bg-white/[0.02]">
        <h2 className="font-display text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">
          On This Page
        </h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {sections.map((s) => (
            <li key={s.title}>
              <a
                href={`#${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                className="text-sm text-slate-400 hover:text-nano-yellow transition-colors"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sections */}
      <div className="space-y-16">
        {sections.map((s) => (
          <section
            key={s.title}
            id={s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
          >
            <h2 className="font-display text-2xl font-bold text-white mb-4 scroll-mt-24">
              {s.title}
            </h2>
            <div className="text-[16px] leading-relaxed text-slate-300 whitespace-pre-line">
              {s.content}
            </div>
          </section>
        ))}
      </div>
    </ContentPageLayout>
  );
}
