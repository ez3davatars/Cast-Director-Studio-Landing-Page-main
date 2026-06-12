import { useScrollReveal } from '../hooks/useScrollReveal';

export default function LaunchAdvantage() {
  const revealRef = useScrollReveal({ staggerDelay: 250 });

  return (
    <section id="pipeline" className="px-6 py-14 md:py-16 relative">
      {/* Section atmosphere — warm-to-cool gradient band */}
      <div className="absolute inset-0 bg-gradient-to-b from-nano-surface1 via-[#060e1f] to-[#030712] pointer-events-none" />

      {/* Warm top divider */}
      <div className="absolute top-0 left-0 w-full section-divider-warm" />

      <div className="mx-auto max-w-[1280px] relative z-10" ref={revealRef}>

        {/* Top row: Copy left (5 cols), bento chips right (7 cols) */}
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-12 xl:gap-10 items-start">

          {/* Left Column: Copy */}
          <div className="xl:col-span-5" data-reveal="left">
            <div className="flex flex-col gap-3 mb-5">
              <div className="w-10 h-[3px] rounded-full bg-nano-amber" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-nano-yellow">
                Creative Direction & Production Control
              </span>
            </div>
            <h2 className="text-3xl font-display font-bold tracking-tight text-white md:text-[42px] leading-[1.1]">
              One Creative Foundation. Endless Visual Possibilities.
            </h2>
            <div className="mt-5 space-y-4 text-[17px] leading-relaxed text-slate-300">
              <p>
                Build a strong visual foundation with guided creative direction, then explore endless variations across styles, poses, environments, and contexts.
              </p>
              <p>
                Whether you're creating spokespeople, brand mascots, thumbnail characters, product models, or storytelling visuals — start with directed controls to build your foundation, then iterate with less friction.
              </p>
              <p>
                From photorealistic professionals to stylized mascots, sci-fi characters, illustrated personalities, and digital doubles, Cast Director Studio brings guided creative direction, reference workflows, and production controls into one unified environment — helping creators move from concept to production-ready assets faster.
              </p>
            </div>
          </div>

          {/* Right Column: Bento Chips */}
          <div className="xl:col-span-7" data-reveal="right">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Hero Chip — Presets as Launch Points */}
              <div className="sm:row-span-2 rounded-[28px] flex flex-col justify-center min-h-[300px] p-8 bg-gradient-to-br from-amber-950/40 via-amber-900/20 to-transparent border border-amber-500/10 shadow-lg group transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-nano-yellow/10 blur-[80px] rounded-full pointer-events-none" />
                <div className="w-12 h-12 rounded-full bg-nano-yellow/10 flex items-center justify-center mb-5 border border-nano-yellow/20 relative z-10">
                  <div className="w-3.5 h-3.5 rounded-full bg-nano-yellow animate-glow-pulse shadow-[0_0_20px_rgba(250,204,21,0.6)]" />
                </div>
                <span className="font-display font-bold text-white text-[22px] leading-snug relative z-10">Build a creative foundation once. Direct it across endless possibilities.</span>
              </div>

              {/* Medium Chip 1 */}
              <div className="rounded-[20px] p-6 flex flex-col justify-center gap-3 transition-all duration-300 hover:-translate-y-1 bg-white/[0.02] border border-white/[0.06] hover:border-nano-yellow/20 border-l-2 border-l-slate-500/30">
                <span className="font-semibold text-white text-[15.5px] leading-snug">Use guided controls for lighting, wardrobe, props, and scene direction.</span>
              </div>

              {/* Medium Chip 2 */}
              <div className="rounded-[20px] p-6 flex flex-col justify-center gap-3 transition-all duration-300 hover:-translate-y-1 bg-white/[0.02] border border-white/[0.06] hover:border-nano-yellow/20 border-l-2 border-l-slate-500/30">
                <span className="font-semibold text-white text-[15.5px] leading-snug">Iterate faster with less prompt engineering and trial-and-error.</span>
              </div>

              {/* Status Row */}
              <div className="sm:col-span-2 py-2.5 px-4 flex items-center gap-3 border-b border-white/[0.04]">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span className="font-medium text-slate-400 text-[15px]">Desktop-first control. Production-ready workflows. Your assets remain yours.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width multi-style showcase image — tighter to top row */}
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
              Preset Range · Starting Points
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
