import { useScrollReveal } from '../hooks/useScrollReveal';

const ownershipPoints = [
  {
    title: 'Desktop-First Workflow',
    desc: 'Work from a local creator environment built for production workflows.',
  },
  {
    title: 'Local Project Storage',
    desc: 'Keep projects, references, character sheets, and creative assets organized on your device.',
  },
  {
    title: 'Client-Friendly Asset Management',
    desc: 'Manage client references, brand visuals, and production outputs in one controlled workspace.',
  },
  {
    title: 'Secure Gemini Generation',
    desc: "Generation requests are handled securely through Google's API.",
  },
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
              Projects, references, character sheets, and creative assets remain under your control while Gemini securely handles generation requests through its API.
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
            <div className="w-full max-w-[400px] p-8 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] backdrop-blur-sm shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]">
              <div className="space-y-6">
                <div className="w-12 h-12 rounded-xl bg-nano-yellow/20 border border-nano-yellow/40 flex items-center justify-center">
                  <svg className="w-6 h-6 text-nano-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>

                <div>
                  <h3 className="text-[18px] font-display font-bold text-white mb-3">Organized Creative Control</h3>
                  <p className="text-[14px] leading-relaxed text-slate-300">
                    Keep your references, settings, and generated assets connected to the project they belong to, so your creative workflow stays organized from idea to delivery.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
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
      </div>
    </section>
  );
}
