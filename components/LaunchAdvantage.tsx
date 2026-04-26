import { useScrollReveal } from '../hooks/useScrollReveal';

export default function LaunchAdvantage() {
  const revealRef = useScrollReveal({ staggerDelay: 250 });

  return (
    <section className="px-6 py-20 relative">
      {/* Section atmosphere — warm-to-cool gradient band */}
      <div className="absolute inset-0 bg-gradient-to-b from-nano-surface1 via-[#060e1f] to-[#030712] pointer-events-none" />
      
      {/* Warm top divider */}
      <div className="absolute top-0 left-0 w-full section-divider-warm" />

      <div className="mx-auto max-w-6xl relative z-10" ref={revealRef}>
        
        {/* Top row: Copy left, bento chips right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          
          {/* Left Column: Copy */}
          <div className="lg:col-span-5" data-reveal="left">
            <div className="flex flex-col gap-3 mb-6">
              <div className="w-10 h-[3px] rounded-full bg-nano-amber" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-nano-yellow">
                Beyond Prompt Trial-and-Error
              </span>
            </div>
            <h2 className="text-3xl font-display font-bold tracking-tight text-white md:text-[44px] leading-[1.1]">
              Multi-Style Character Creation — One Directed Workflow, Five Visual Styles
            </h2>
            <div className="mt-6 space-y-4 text-[18px] leading-relaxed text-slate-300">
              <p>
                Your cast is not limited to people. Build scenes with humans, animals, mascots, stylized characters, anime characters, sci-fi characters, illustrated characters, and brand-driven digital actors — all with the same directed pipeline.
              </p>
              <p>
                Switch between styles without switching tools or rewriting prompts. The same character foundations, wardrobe systems, and scene controls carry across every visual direction — so creators can move faster without starting from zero every time.
              </p>
            </div>
          </div>

          {/* Right Column: Bento Chips */}
          <div className="lg:col-span-7" data-reveal="right">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Hero Chip — Style Versatility */}
              <div className="sm:row-span-2 rounded-[28px] flex flex-col justify-end min-h-[240px] p-7 bg-gradient-to-br from-amber-950/40 via-amber-900/20 to-transparent border border-amber-500/10 shadow-lg group transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-nano-yellow/10 blur-[80px] rounded-full pointer-events-none" />
                  <div className="w-12 h-12 rounded-full bg-nano-yellow/10 flex items-center justify-center mb-5 border border-nano-yellow/20 relative z-10">
                      <div className="w-3.5 h-3.5 rounded-full bg-nano-yellow animate-glow-pulse shadow-[0_0_20px_rgba(250,204,21,0.6)]" />
                  </div>
                  <span className="font-display font-bold text-white text-xl leading-snug relative z-10">Five visual styles from one directed character pipeline</span>
              </div>
              
              {/* Medium Chip 1 */}
              <div className="rounded-[20px] p-5 flex flex-col justify-center gap-3 transition-all duration-300 hover:-translate-y-1 bg-white/[0.02] border border-white/[0.06] hover:border-nano-yellow/20 border-l-2 border-l-slate-500/30">
                  <span className="font-semibold text-white text-[16px] leading-snug">Consistent wardrobe and props — without re-prompting for each style</span>
              </div>
              
              {/* Medium Chip 2 */}
              <div className="rounded-[20px] p-5 flex flex-col justify-center gap-3 transition-all duration-300 hover:-translate-y-1 bg-white/[0.02] border border-white/[0.06] hover:border-nano-yellow/20 border-l-2 border-l-slate-500/30">
                  <span className="font-semibold text-white text-[16px] leading-snug">Same scene controls and composition direction for all styles</span>
              </div>
              
              {/* Status Row */}
              <div className="sm:col-span-2 py-2.5 px-4 flex items-center gap-3 border-b border-white/[0.04]">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  <span className="font-medium text-slate-400 text-[15px]">One workflow engine. Five visual directions. Zero tool-switching.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width multi-style showcase image — below the grid */}
        <div className="mt-12 glass-panel-premium rounded-[28px] p-1.5 relative overflow-hidden group transition-transform duration-300 hover:-translate-y-1" data-reveal="up">
          <div className="relative rounded-[22px] overflow-hidden">
            <img 
              src="/multi-style.png"
              alt="Same character rendered across realism, stylized, illustration, sci-fi, and anime art styles — demonstrating multi-style character creation"
              className="w-full h-auto object-cover max-h-[400px]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-nano-abyss/50 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md border border-nano-yellow/20 px-3 py-1.5 rounded-lg text-[11px] text-nano-yellow font-display tracking-widest uppercase flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-nano-yellow rounded-full" />
              5 Styles · 1 Character
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
