import ContentPageLayout from '../components/ContentPageLayout';

const sections = [
  {
    title: 'What Is Cast Director Studio?',
    content: `Cast Director Studio is a desktop AI creative tool for creators who want more control over AI image generation. It acts as a creative control layer for Gemini and AI image generation, helping you direct lighting, wardrobe, props, scene context, references, and production outputs without relying only on long prompts.

The goal is not to replace Gemini or future image models. The goal is to give creators a structured way to direct, organize, and manage those models more effectively.`,
  },
  {
    title: 'Who Is It For?',
    content: `Cast Director Studio is built for AI content creators, filmmakers, illustrators, brand designers, thumbnail creators, marketers, and visual storytellers who need faster creative iteration and better production organization.

Use it for spokespeople, brand mascots, thumbnail characters, product models, digital doubles, storytelling characters, social media personalities, marketing visuals, and other AI-generated visual workflows.`,
  },
  {
    title: 'Core Workflow',
    content: `The typical Cast Director Studio workflow follows five steps:

1. Add references or start from scratch to define the visual direction for your project.
2. Choose lighting, wardrobe, props, style, and scene direction through guided controls.
3. Build visual anchors for people, clients, spokespeople, characters, or brand personalities.
4. Generate variations through Gemini with less prompt overhead.
5. Export production references and image assets for downstream creative workflows.

This directed approach reduces the cycle of re-prompting, re-describing, and rebuilding ideas that slows down prompt-only workflows.`,
  },
  {
    title: 'Creative Foundations',
    content: `Creative foundations are reusable project anchors for your visual work. Instead of starting every image from a blank prompt, you can organize references, style preferences, lighting direction, wardrobe choices, props, and scene context around the subject or concept you are building.

These foundations can support many use cases, including spokespeople, brand personalities, product visuals, digital doubles, storytelling characters, and marketing campaigns.`,
  },
  {
    title: 'Reference-Guided Photo Upload & Webcam Capture',
    content: `Cast Director Studio supports two methods for creating stronger visual anchors:

Photo Upload: Upload source photos to provide reference material that helps communicate the visual direction of a person, client, spokesperson, character, or brand personality.

Webcam Capture: Use the guided webcam capture workflow to create reference inputs directly from your webcam for creative digital double and visual foundation workflows.

Both methods create creative reference data. They are designed for visual direction, not identity verification, surveillance, face recognition, or guaranteed face cloning.`,
  },
  {
    title: 'Production-Ready Lighting',
    content: `Lighting is one of the most important parts of production-ready AI imagery. Cast Director Studio provides guided lighting direction so creators can communicate clean, readable subject lighting before generation.

AI output can still vary, but structured lighting direction helps creators spend less time rewriting prompts and more time evaluating usable results.`,
  },
  {
    title: 'Wardrobe, Props & Scene Direction',
    content: `Instead of burying every detail inside long prompt text, Cast Director Studio provides guided controls for:

Wardrobe: Direct clothing, outfits, accessories, and styling.
Props: Add object direction and production context.
Scenes: Guide backgrounds, environments, camera mood, and composition context.

These controls help creators communicate visual intent more efficiently across styles and iterations.`,
  },
  {
    title: 'Production References for Future Workflows',
    content: `Production reference sheets are structured visual outputs for downstream work. They can include multi-angle references, expression maps, wardrobe sheets, style guides, lighting profiles, and other organized visual references.

Use them as reference inputs for video AI pipelines, animation workflows, illustration systems, branding systems, marketing content, or any generative workflow that benefits from structured visual references.`,
  },
  {
    title: 'Hosted Cloud vs. BYOK (Bring Your Own Key)',
    content: `Cast Director Studio supports two generation modes:

Hosted Cloud: Generations consume credits from your plan. Prompts, configuration settings, and reference images are sent to the selected AI processing provider, such as Google Gemini, for generation. Generated output images may be temporarily hosted by Cast Director Studio for delivery and download.

BYOK (Bring Your Own Key): Connect your own Gemini API key and run generations through your own account. You are responsible for your API key security and provider costs.

Both modes use the same application, creative controls, and workflow. The difference is how generation usage is billed and routed.`,
  },
  {
    title: 'AI Model Support & Future Providers',
    content: `Cast Director Studio is designed as a provider-aware creative workflow. Image generation is handled by the selected AI processing provider, such as Google Gemini, while Cast Director Studio provides the creative direction layer around that generation process.

As new model options become available, additional provider support may be evaluated where API access, quality, pricing, and creator needs make sense. Cast Director Studio does not guarantee support for every model or provider.`,
  },
  {
    title: 'Credits & Generation Usage',
    content: `Managed API generations consume credits from your plan. Each plan includes a set number of monthly credits, and additional credit packs are available for purchase inside your account dashboard.

Generation Credits are pegged to render size:

- Standard 1K Generation: 1 Credit
- 2K Widescreen or Production Reference Sheet: 2 Credits
- Ultra-High 4K Generation: 6 Credits

BYOK users do not consume Cast Director Studio credits. They use their own API key and are billed directly by their AI provider.`,
  },
  {
    title: 'Desktop-First Workflow',
    content: `Cast Director Studio provides the creative workspace and direction system for projects, references, production sheets, and generated assets.

Projects, references, character sheets, and creative assets remain under your control while Gemini securely handles generation requests through its API. Account and license information may also sync with Cast Director Studio services.`,
  },
  {
    title: 'Hosted Image Availability',
    content: `When using Hosted Cloud generation, generated output images may be temporarily hosted by Cast Director Studio for delivery to your desktop client. This temporary hosting applies to generated output images, not long-term project storage.

Always save important outputs to your local project.`,
  },
  {
    title: 'Troubleshooting Basics',
    content: `Common issues and quick solutions:

Generation not starting: Check your internet connection and verify your license or credits are active in your account dashboard.

Results drift from your intent: Review your references, lighting direction, style settings, and scene controls before generating another variation.

Download not completing: Hosted assets may be temporary. If a download fails, try regenerating or contact support.

BYOK errors: Verify your API key is valid and has sufficient balance with your provider.

App not launching: Ensure your system meets the minimum requirements and try restarting the application.

For additional help, reach out to support@castdirectorstudio.com.`,
  },
];

export default function Documentation() {
  return (
    <ContentPageLayout title="Documentation">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Documentation
        </h1>
        <p className="text-lg text-slate-300 leading-relaxed max-w-3xl">
          Everything you need to know about Cast Director Studio, how it works,
          what it does, and how to get the most out of your creative workflow.
        </p>
      </div>

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
