const features = [
  {
    title: 'Guided Creative Controls',
    body: 'Direct characters, wardrobe, lighting, props, and scenes through structured controls instead of complex prompts. Reduce prompt engineering overhead and move faster from creative intent to generated result.',
  },
  {
    title: 'Production-Ready Lighting',
    body: 'Guide generation toward clean, readable subject lighting. Subjects are clear and usable for AI video, product showcases, thumbnails, character references, and downstream production workflows.',
  },
  {
    title: 'Wardrobe & Styling Direction',
    body: 'Define and maintain wardrobe, accessories, and props through structured controls. Keep styling connected across multiple generations without re-describing outfits every time.',
  },
  {
    title: 'Scene Direction & Environment Control',
    body: 'Guide background, camera composition, mood, and scene context before generation. Produce more intentional visuals for portraits, digital doubles, character references, and production-ready assets.',
  },
  {
    title: 'Visual Reference Workflows',
    body: 'Build visual anchors from references, settings, and generated outputs. Give Gemini clearer creative direction without turning every revision into a prompt rewrite.',
  },
  {
    title: 'Desktop Asset Ownership',
    body: 'Work from a local desktop environment built for production workflows. Keep projects, references, character sheets, and creative assets under your control.',
  },
  {
    title: 'Production Reference Sheets',
    body: 'Export structured visual references for future workflows, including video generation, animation, storytelling, branding, marketing, and other downstream creative systems.',
  },
  {
    title: 'Secure Gemini Integration',
    body: "Use Google's latest image generation models through a creator workflow designed for direction, organization, and faster iteration.",
  },
];


import { useScrollReveal } from '../hooks/useScrollReveal';

export default function TechSpecs() {
  const revealRef = useScrollReveal({ staggerDelay: 180 });
  return (
    <section id="features" className="px-6 py-20 relative overflow-hidden">
      {/* Section atmosphere — cool to warm gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-nano-abyss via-nano-surface1 to-[#060e1f] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full section-divider-warm" />

      {/* Warm glow at top — softer, larger */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-nano-yellow/[0.03] blur-[200px] rounded-full pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10" ref={revealRef}>
        <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[44px] leading-tight" data-reveal="up">
          Built For Creative Direction, Not Just Image Generation
        </h2>
        <p className="mt-6 max-w-3xl text-[17px] leading-relaxed text-slate-300" data-reveal="up">
          Most AI tools generate images. Cast Director Studio helps direct them. The platform combines guided controls, visual references, structured workflows, and production tools into a unified environment designed specifically for creators.
        </p>

        <div className="mt-12 grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-[minmax(200px,auto)]">
          {features.map((feature, index) => {
            // Card 0: Hero card — Production-Ready Subject Lighting with image background
            if (index === 0) {
              return (
                <article key={feature.title} className="md:col-span-2 lg:col-span-2 lg:row-span-2 rounded-[32px] glass-panel-elite ring-1 ring-amber-500/10 transition-transform duration-300 hover:-translate-y-1 relative overflow-hidden" data-reveal="scale">
                  {/* Background image — high visibility to showcase subject lighting */}
                  <img
                    src="/techspecs-hero.png"
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover opacity-80"
                    loading="lazy"
                  />
                  {/* Bottom-only text shelf — lets the subject breathe */}
                  <div className="absolute inset-0 bg-gradient-to-t from-nano-abyss via-nano-abyss/70 to-transparent" style={{ top: '55%' }} />

                  {/* Glow accent */}
                  <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-nano-yellow/10 blur-[120px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/4" />

                  {/* Icon cluster */}
                  <div className="absolute top-8 right-8 w-16 h-16 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center shadow-inner z-10">
                    <div className="w-8 h-8 rounded-full bg-nano-yellow/20 flex items-center justify-center animate-glow-pulse">
                      <div className="w-4 h-4 rounded-full bg-nano-yellow shadow-[0_0_20px_rgba(250,204,21,1)]" />
                    </div>
                  </div>

                  {/* Spacer to preserve card height */}
                  <div className="min-h-[300px] lg:min-h-[440px]" />
                  {/* Text pinned to bottom */}
                  <div className="px-10 pb-8 md:px-14 md:pb-10 relative z-10">
                    <h3 className="font-display text-2xl md:text-4xl font-extrabold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">{feature.title}</h3>
                    <p className="mt-4 text-[15px] leading-relaxed text-slate-200 max-w-2xl drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)]">{feature.body}</p>
                  </div>
                </article>
              );
            }

            // Card 1: Better Control — blue accent
            if (index === 1) {
              return (
                <article key={feature.title} className="rounded-[32px] glass-panel editorial-accent-top-blue transition-transform duration-300 hover:-translate-y-1 relative overflow-hidden" data-reveal="up">
                  <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-blue-500/5 blur-[80px] rounded-full pointer-events-none" />
                  <div className="p-8 relative z-10">
                    <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                    <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{feature.body}</p>
                  </div>
                </article>
              );
            }

            // Card 2: Guided Wardrobe — purple accent
            if (index === 2) {
              return (
                <article key={feature.title} className="rounded-[32px] glass-panel editorial-accent-top-purple transition-transform duration-300 hover:-translate-y-1" data-reveal="up">
                  <div className="p-8">
                    <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                    <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{feature.body}</p>
                  </div>
                </article>
              );
            }

            // Card 3: Avatar Scene Direction — emerald accent
            if (index === 3) {
              return (
                <article key={feature.title} className="rounded-[32px] glass-panel transition-transform duration-300 hover:-translate-y-1 border-l-2 border-l-emerald-500/20" data-reveal="up">
                  <div className="p-8">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5 leading-none">Preview</span>
                    </div>
                    <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{feature.body}</p>
                  </div>
                </article>
              );
            }

            // Card 4: Less Prompt Overhead — standard
            if (index === 4) {
              return (
                <article key={feature.title} className="rounded-[32px] glass-panel transition-transform duration-300 hover:-translate-y-1" data-reveal="up">
                  <div className="p-8">
                    <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                    <p className="mt-4 text-base leading-relaxed text-slate-300">{feature.body}</p>
                  </div>
                </article>
              );
            }

            // Card 5: Local Desktop Workflow — warm accent
            return (
              <article key={feature.title} className="rounded-[32px] glass-panel-premium border-l-2 border-l-nano-yellow/30 relative overflow-hidden transition-transform duration-300 hover:-translate-y-1" data-reveal="up">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-950/10 to-transparent pointer-events-none" />
                <div className="p-8 relative z-10">
                  <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{feature.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
