import ContentPageLayout from '../components/ContentPageLayout';

export default function About() {
  return (
    <ContentPageLayout title="About EZ3D Avatars">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          About EZ3D Avatars
        </h1>
        <p className="text-lg text-slate-300 leading-relaxed max-w-3xl">
          EZ3D Avatars builds creator tools for AI-driven visual production.
        </p>
      </div>

      <div className="space-y-12">
        <section>
          <h2 className="font-display text-2xl font-bold text-white mb-4">
            The Company Behind Cast Director Studio
          </h2>
          <p className="text-[16px] leading-relaxed text-slate-300 mb-6">
            EZ3D Avatars, LLC is the company behind Cast Director Studio, a
            desktop AI creative tool designed to help creators move from prompt
            trial-and-error to directed creative production.
          </p>
          <p className="text-[16px] leading-relaxed text-slate-300">
            We believe AI content creation should feel more like directing a
            production and less like guessing in a text box. Cast Director Studio
            is built around that principle, giving creators guided controls for
            lighting, wardrobe, props, scene direction, visual references,
            production sheets, and asset organization.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-white mb-4">
            What We Build
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: 'Creative Foundations',
                desc: 'Reference-guided visual foundations for spokespeople, brand personalities, product models, digital doubles, and storytelling subjects.',
              },
              {
                title: 'Production-Ready Lighting',
                desc: 'Guided lighting controls that help creators communicate clean, readable subject lighting.',
              },
              {
                title: 'Wardrobe & Styling Direction',
                desc: 'Visual controls for clothing, accessories, styling, and product presentation.',
              },
              {
                title: 'Scene Direction',
                desc: 'Guide background, camera, mood, and scene context before generation.',
              },
              {
                title: 'Production Reference Sheets',
                desc: 'Structured reference outputs for downstream AI tools and production workflows.',
              },
              {
                title: 'Gemini Generation Workflows',
                desc: "A creative control layer for Google's latest image generation models.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-5 rounded-2xl border border-white/[0.04] bg-white/[0.02]"
              >
                <h3 className="font-display text-base font-bold text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-white mb-4">
            Desktop-First Creator Control
          </h2>
          <p className="text-[16px] leading-relaxed text-slate-300">
            Cast Director Studio provides the creative workspace and direction
            system. Projects, references, character sheets, and creative assets
            remain under your control while Gemini securely handles generation
            requests through its API.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-white mb-4">
            Built From Years Inside Visual Production Workflows
          </h2>
          <p className="text-[16px] leading-relaxed text-slate-300 mb-6">
            If you have ever spent hours trying to steer an AI image toward a
            specific creative vision, Cast Director Studio was built with that
            friction in mind.
          </p>
          <p className="text-[16px] leading-relaxed text-slate-300 mb-6">
            EZ3D Avatars has been working in the avatar space since 2016,
            watching creators run into the same challenge across 3D characters,
            animation, AI, VR, AR, and interactive systems: they need better
            quality and control without heavy production pipelines.
          </p>
          <p className="text-[16px] leading-relaxed text-slate-300">
            Cast Director Studio brings that experience into one focused
            workflow, helping creators direct lighting, styling, references,
            scenes, and production-ready visual assets faster, with less prompt
            wrestling and more creative control.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-white mb-4">
            Built to Evolve With Leading AI Image Models
          </h2>
          <p className="text-[16px] leading-relaxed text-slate-300 mb-6">
            AI image generation is moving fast. Cast Director Studio is designed
            to advance with leading image models and provider capabilities while
            keeping the creator workflow focused on guided controls, visual
            references, desktop asset ownership, and production-ready outputs.
          </p>
          <p className="text-[16px] leading-relaxed text-slate-300">
            As new model options become available, our goal is to evaluate and
            support the generators that best serve serious creator workflows.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-white mb-4">
            Our Mission
          </h2>
          <div className="p-8 rounded-2xl border border-nano-yellow/10 bg-nano-yellow/[0.02]">
            <p className="text-lg text-white font-medium leading-relaxed">
              Help creators move from prompt trial-and-error to directed
              creative production, building production-ready visual assets faster
              than prompt-only workflows.
            </p>
          </div>
        </section>
      </div>
    </ContentPageLayout>
  );
}
