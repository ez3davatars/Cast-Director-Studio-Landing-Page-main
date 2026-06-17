import { useScrollReveal } from '../hooks/useScrollReveal';

const videoFlow = [
  'Visual Concept',
  'Reference Image',
  'Character Sheet',
  'Scene Asset',
  'AI Video Tool',
];

const foundations = [
  'Spokespeople',
  'Digital doubles',
  'Mascots',
  'Wardrobe references',
  'Lighting references',
  'Scene references',
];

export default function AiVideoFoundations() {
  const revealRef = useScrollReveal({ staggerDelay: 180 });

  return (
    <section id="ai-video-foundations" className="px-6 py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-nano-abyss via-[#07111f] to-[#060e1f] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full section-divider-warm" />
      <div className="absolute bottom-0 left-1/2 h-[500px] w-[860px] -translate-x-1/2 rounded-full bg-blue-500/[0.04] blur-[150px] pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10" ref={revealRef}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5" data-reveal="left">
            <div className="flex flex-col gap-3 mb-6">
              <div className="w-10 h-[3px] rounded-full bg-nano-yellow/70" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-nano-yellow">
                Image Foundations For Motion
              </span>
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[44px] leading-[1.1]">
              Built for AI Video Foundations
            </h2>
            <div className="mt-6 space-y-4 text-[16px] leading-relaxed text-slate-300">
              <p>
                Many AI video tools perform best when they begin with strong visual foundations.
              </p>
              <p>
                Cast Director Studio helps creators develop spokespeople, digital doubles, mascots, character concepts, wardrobe references, lighting references, scene references, and production-ready visual assets before moving into video generation.
              </p>
              <p>
                Build the visual foundation first. Then bring stronger source material into your AI video workflow.
              </p>
            </div>
          </div>

          <div className="lg:col-span-7" data-reveal="right">
            <div className="relative rounded-[28px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] overflow-hidden">
              <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-nano-yellow/10 blur-[95px]" />
              <div className="relative grid gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {videoFlow.map((step, index) => (
                    <div key={step} className="group relative rounded-[18px] border border-white/10 bg-black/25 p-4 min-h-[112px] transition duration-300 hover:-translate-y-1 hover:border-nano-yellow/30 hover:bg-white/[0.05]">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-nano-yellow/80">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div className="mt-4 text-[14px] font-semibold leading-snug text-white">
                        {step}
                      </div>
                      {index < videoFlow.length - 1 && (
                        <div className="hidden sm:block absolute right-[-14px] top-1/2 h-px w-7 bg-gradient-to-r from-nano-yellow/40 to-transparent" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="rounded-[22px] border border-blue-500/15 bg-blue-500/[0.04] p-5">
                  <div className="flex flex-wrap gap-2">
                    {foundations.map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-slate-300">
                        {item}
                      </span>
                    ))}
                  </div>
                  <p className="mt-5 text-[14px] leading-relaxed text-slate-400">
                    Organize the still-image references, character sheets, and scene assets that can become stronger inputs for downstream video platforms.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
