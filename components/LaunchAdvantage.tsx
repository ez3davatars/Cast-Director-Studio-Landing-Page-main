import { useScrollReveal } from '../hooks/useScrollReveal';

const pipelineSteps = [
  'Creative Idea',
  'Guided Selections',
  'Optimized Gemini Instructions',
  'Production-Ready Visuals',
];

const assetBullets = [
  'Choose the outcome you want without needing advanced prompt knowledge.',
  'Let the app translate your creative selections into Gemini-ready instructions.',
  'Build stronger visual assets for images, AI video, thumbnails, branding, and storytelling.',
  'Move from idea to usable production assets with less manual prompt work.',
];

export default function LaunchAdvantage() {
  const revealRef = useScrollReveal({ staggerDelay: 250 });

  return (
    <section id="pipeline" className="px-6 py-14 md:py-16 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-nano-surface1 via-[#060e1f] to-[#030712] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full section-divider-warm" />

      <div className="mx-auto max-w-[1280px] relative z-10" ref={revealRef}>
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-12 xl:gap-10 items-start">
          <div className="xl:col-span-5" data-reveal="left">
            <div className="flex flex-col gap-3 mb-5">
              <div className="w-10 h-[3px] rounded-full bg-nano-amber" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-nano-yellow">
                From Selection To Generation
              </span>
            </div>
            <h2 className="text-3xl font-display font-bold tracking-tight text-white md:text-[42px] leading-[1.1]">
              From Creative Idea to Production Asset
            </h2>
            <div className="mt-5 space-y-4 text-[17px] leading-relaxed text-slate-300">
              <p>
                Cast Director Studio helps creators turn simple creative decisions into polished AI visuals. Whether you are creating a spokesperson, brand mascot, thumbnail character, product model, digital double, storytelling character, social media personality, or marketing visual, the workflow helps you move faster without rebuilding prompts from scratch.
              </p>
              <p>
                Start with guided presets when you want speed. Refine style, lighting, wardrobe, props, scene context, and reference-based details when you need more precision.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              {assetBullets.map((bullet) => (
                <div key={bullet} className="flex items-start gap-3">
                  <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-nano-yellow shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                  <p className="text-[15px] leading-relaxed text-slate-300">{bullet}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="xl:col-span-7" data-reveal="right">
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-nano-yellow/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-nano-yellow/10 blur-[90px]" />
              <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-blue-500/10 blur-[110px]" />
              <div className="relative grid gap-4">
                {pipelineSteps.map((step, index) => (
                  <div key={step} className="group relative flex items-center gap-4 rounded-[20px] border border-white/10 bg-black/25 p-5 transition duration-300 hover:-translate-y-1 hover:border-nano-yellow/30 hover:bg-white/[0.05]">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-nano-yellow/20 bg-nano-yellow/10 text-sm font-bold text-nano-yellow shadow-[0_0_24px_rgba(250,204,21,0.08)]">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div>
                      <p className="text-[17px] font-semibold text-white">{step}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                        {index === 0 && 'Start with the visual outcome, campaign, character, or scene you need.'}
                        {index === 1 && 'Pick style, references, wardrobe, lighting, props, and direction from guided controls.'}
                        {index === 2 && 'The app structures those choices into clearer Gemini-ready instructions.'}
                        {index === 3 && 'Generate organized assets for marketing, branding, storytelling, images, and video prep.'}
                      </p>
                    </div>
                    {index < pipelineSteps.length - 1 && (
                      <div className="absolute -bottom-4 left-[43px] h-4 w-px bg-gradient-to-b from-nano-yellow/40 to-transparent" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 lg:mt-10 glass-panel-premium rounded-[28px] p-1.5 relative overflow-hidden group transition-transform duration-300 hover:-translate-y-1" data-reveal="up">
          <div className="relative rounded-[22px] overflow-hidden">
            <img
              src="/multi-style.png"
              alt="Creative foundation explored across realism, stylized, illustration, sci-fi, and anime art styles"
              className="w-full h-auto object-cover max-h-[400px]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-nano-abyss/50 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md border border-nano-yellow/20 px-3 py-1.5 rounded-lg text-[11px] text-nano-yellow font-display tracking-widest uppercase flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-nano-yellow rounded-full" />
              Creative Selections To Gemini-Ready Direction
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
