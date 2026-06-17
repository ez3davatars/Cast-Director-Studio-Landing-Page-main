import { Check, X } from 'lucide-react';
import { useScrollReveal } from '../hooks/useScrollReveal';

const promptBoxItems = [
  'Requires manual prompt writing',
  'Requires lighting and style terminology',
  'Often involves repeated prompt rewrites',
  'Visual references can become scattered',
  'Harder to organize production assets',
];

const studioItems = [
  'Make guided creative selections',
  'Built-in prompt intelligence handles structure',
  'Lighting, wardrobe, style, and scene options are integrated',
  'References and outputs stay organized',
  'Better foundation for image and AI video workflows',
];

export default function GeminiComparison() {
  const revealRef = useScrollReveal({ staggerDelay: 160 });

  return (
    <section id="gemini-comparison" className="px-6 py-20 relative overflow-hidden bg-nano-abyss">
      <div className="absolute inset-0 bg-gradient-to-b from-[#030712] via-nano-surface1 to-nano-abyss pointer-events-none" />
      <div className="absolute top-0 left-0 w-full section-divider-cool" />
      <div className="absolute left-1/2 top-1/2 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-nano-yellow/[0.04] blur-[150px] pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10" ref={revealRef}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5" data-reveal="left">
            <div className="flex flex-col gap-3 mb-6">
              <div className="w-10 h-[3px] rounded-full bg-blue-500/60" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400">
                Model Engine, Creator Controls
              </span>
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[44px] leading-[1.1]">
              Why Not Just Use Gemini Directly?
            </h2>
            <div className="mt-6 space-y-4 text-[16px] leading-relaxed text-slate-300">
              <p>
                Gemini is a powerful image generation model. The challenge is not access to the model. The challenge is consistently communicating what you want.
              </p>
              <p>
                Cast Director Studio helps bridge that gap with guided creative workflows, built-in prompt intelligence, visual reference tools, and production-focused controls designed for creators.
              </p>
            </div>
            <div className="mt-8 rounded-[24px] border border-nano-yellow/15 bg-nano-yellow/[0.05] p-6">
              <p className="text-[15px] leading-relaxed text-slate-300">
                Think of Gemini as the engine.
              </p>
              <p className="mt-2 font-display text-2xl font-bold text-white">
                Cast Director Studio helps you drive it.
              </p>
            </div>
          </div>

          <div className="lg:col-span-7" data-reveal="right">
            <div className="relative grid gap-5 md:grid-cols-2">
              <div className="rounded-[28px] border border-white/10 bg-black/25 p-6 transition duration-300 hover:-translate-y-1 hover:border-white/20">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h3 className="font-display text-xl font-bold text-white">Prompt Box Workflow</h3>
                  <div className="h-9 w-9 rounded-xl border border-red-400/20 bg-red-500/10 flex items-center justify-center text-red-300">
                    <X size={18} />
                  </div>
                </div>
                <div className="space-y-4">
                  {promptBoxItems.map((item) => (
                    <div key={item} className="flex gap-3 text-[14px] leading-relaxed text-slate-400">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-300/60" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative rounded-[28px] border border-nano-yellow/25 bg-gradient-to-b from-amber-950/30 via-[#0f172a] to-nano-surface1 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.36)] transition duration-300 hover:-translate-y-1 hover:border-nano-yellow/40">
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-nano-yellow/70 to-transparent" />
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h3 className="font-display text-xl font-bold text-white">Cast Director Studio Workflow</h3>
                  <div className="h-9 w-9 rounded-xl border border-nano-yellow/30 bg-nano-yellow/15 flex items-center justify-center text-nano-yellow">
                    <Check size={18} strokeWidth={3} />
                  </div>
                </div>
                <div className="space-y-4">
                  {studioItems.map((item) => (
                    <div key={item} className="flex gap-3 text-[14px] leading-relaxed text-slate-200">
                      <Check size={16} className="mt-0.5 shrink-0 text-nano-yellow" strokeWidth={3} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-nano-yellow/20 bg-black/60 text-[10px] font-bold uppercase tracking-[0.18em] text-nano-yellow shadow-[0_0_35px_rgba(250,204,21,0.18)] backdrop-blur-md md:flex">
                Drive
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
