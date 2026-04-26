import { useScrollReveal } from '../hooks/useScrollReveal';

export default function CharacterSheets() {
  const revealRef = useScrollReveal({ staggerDelay: 200 });
  return (
    <section id="character-sheets" className="px-6 py-20 relative overflow-hidden">
      {/* Section atmosphere */}
      <div className="absolute inset-0 bg-gradient-to-b from-nano-abyss via-[#060e1f] to-nano-surface1 pointer-events-none" />
      <div className="absolute top-0 left-0 w-full section-divider-warm" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-purple-500/[0.03] blur-[150px] rounded-full pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10" ref={revealRef}>
        
        {/* Compact section header */}
        <div className="max-w-3xl mb-12" data-reveal="up">
          <div className="flex flex-col gap-3 mb-6">
            <div className="w-10 h-[3px] rounded-full bg-purple-500/60" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-400">
              Downstream Generative Tools
            </span>
          </div>

          <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[44px] leading-[1.1]">
            Character Sheets for Stronger Generative Consistency
          </h2>

          <p className="mt-5 text-[16px] leading-relaxed text-slate-300 max-w-[560px]">
            Generate character sheets and consistency references that help authors, comic creators, AI filmmakers, and brand storytellers keep visual identity stable across future generations — without re-prompting from scratch every session.
          </p>
        </div>

        {/* Three-card bento */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          
          {/* Card 1: Hero — Structured Reference Outputs with IMAGE */}
          <div className="lg:col-span-2 lg:row-span-2 rounded-[28px] glass-panel-elite relative overflow-hidden transition-transform duration-300 hover:-translate-y-1 ring-1 ring-purple-500/10" data-reveal="scale">
            <img 
              src="/character-sheet.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover opacity-60"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-nano-abyss via-nano-abyss/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-nano-abyss/50 to-transparent" />
            
            <div className="absolute top-0 right-0 w-[350px] h-[350px] bg-purple-500/10 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/4" />
            
            <div className="p-8 md:p-10 flex flex-col justify-end min-h-[300px] lg:min-h-[380px] relative z-10">
              <div className="w-12 h-12 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-transparent flex items-center justify-center shadow-inner mb-6">
                <div className="w-3 h-3 rounded-sm bg-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.6)]" />
              </div>

              <h3 className="font-display text-2xl md:text-3xl font-extrabold text-white">
                Structured Reference Outputs
              </h3>
              <p className="mt-4 text-[16px] leading-relaxed text-slate-300 max-w-xl">
                Generate multi-angle character reference sheets, expression maps, and styling guides that capture your character's visual identity in a structured format. These sheets work as visual prompts for other generative tools, video AI pipelines, and production workflows.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {['Multi-Angle Refs', 'Expression Maps', 'Wardrobe Sheets', 'Style Guides', 'Lighting Profiles'].map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/15 text-purple-300 text-[11px] font-medium backdrop-blur-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Card 2: Visual Anchoring */}
          <div className="rounded-[28px] glass-panel editorial-accent-top-purple transition-transform duration-300 hover:-translate-y-1" data-reveal="up">
            <div className="p-7">
              <h3 className="text-lg font-semibold text-white">Stronger Visual Anchoring</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
                Character sheets give generative workflows a structured reference point. Instead of re-describing characters from memory, downstream tools can reference visual outputs that capture lighting, expression, wardrobe, and identity traits — reducing repetitive prompt work.
              </p>
            </div>
          </div>

          {/* Card 3: Downstream Workflows */}
          <div className="rounded-[28px] glass-panel transition-transform duration-300 hover:-translate-y-1 border-l-2 border-l-purple-500/20" data-reveal="up">
            <div className="p-7">
              <h3 className="text-lg font-semibold text-white">Built for Downstream Workflows</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
                Character sheets are designed as production-ready reference assets. Use them as input for video AI tools, animation pipelines, illustration workflows, or any generative system that benefits from structured visual references — and move faster across tools.
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
