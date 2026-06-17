import { useScrollReveal } from '../hooks/useScrollReveal';

const ownershipPoints = [
  {
    title: 'Desktop-First Creative Environment',
    desc: 'Projects, references, character sheets, and creative assets stay organized under your control.',
  },
  {
    title: 'Secure Gemini Requests',
    desc: 'Gemini securely handles generation requests through its API based on the mode you choose.',
  },
  {
    title: 'Organized Returned Outputs',
    desc: 'Bring generated assets back into a local project library designed for production workflows.',
  },
];

const localFlow = [
  'Your Device',
  'Secure Gemini Request',
  'Returned Output',
  'Local Project Library',
];

export default function PrivacyAssurance() {
  const revealRef = useScrollReveal({ staggerDelay: 150 });

  return (
    <section id="privacy-assurance" className="px-6 py-20 relative bg-nano-abyss">
      <div className="absolute top-0 left-0 w-full section-divider-warm" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/[0.02] to-transparent pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-blue-500/[0.04] blur-[150px] rounded-full pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10" ref={revealRef}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div data-reveal="up">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[44px] leading-tight">
              Your Projects. Your Assets. Your Control.
            </h2>
            <p className="mt-6 text-[17px] leading-relaxed text-slate-300">
              Cast Director Studio is built as a desktop-first creative environment. Projects, references, character sheets, and creative assets remain organized under your control, while Gemini securely handles generation requests through its API.
            </p>

            <div className="mt-10 space-y-4">
              {ownershipPoints.map((point) => (
                <div key={point.title} className="flex gap-4" data-reveal="up">
                  <div className="w-5 h-5 rounded-full bg-nano-yellow/30 flex items-center justify-center shrink-0 mt-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-nano-yellow" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-white">{point.title}</p>
                    <p className="text-[14px] text-slate-400 mt-1">{point.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div data-reveal="up" className="flex items-center justify-center">
            <div className="w-full max-w-[460px] p-6 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] backdrop-blur-sm shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]">
              <div className="space-y-4">
                {localFlow.map((step, index) => (
                  <div key={step} className="relative flex items-center gap-4 rounded-[20px] border border-white/10 bg-black/25 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-nano-yellow/20 bg-nano-yellow/10 text-[12px] font-bold text-nano-yellow">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <p className="text-[15px] font-semibold text-white">{step}</p>
                    {index < localFlow.length - 1 && (
                      <div className="absolute -bottom-4 left-9 h-4 w-px bg-gradient-to-b from-nano-yellow/40 to-transparent" />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 pt-5 border-t border-white/[0.06]">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Workflow</p>
                  <p className="text-lg font-bold text-white mt-1">Desktop</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Generation</p>
                  <p className="text-lg font-bold text-white mt-1">Gemini API</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
