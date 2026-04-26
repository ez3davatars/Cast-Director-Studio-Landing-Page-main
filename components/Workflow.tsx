const steps = [
  'Add reference photos or start from scratch — define your character direction across five visual styles',
  'Build a reusable AI actor with reference-guided identity capture',
  'Direct subject lighting, wardrobe, props, and scene with guided creative controls',
  'Generate cinematic variations with less prompt overhead',
  'Export character sheets and consistency references — ready for production',
];

import { useScrollReveal } from '../hooks/useScrollReveal';

export default function Workflow() {
  const revealRef = useScrollReveal({ staggerDelay: 180 });
  return (
    <section id="workflow" className="px-6 py-20 relative bg-nano-abyss">
      {/* Cool section divider at top */}
      <div className="absolute top-0 left-0 w-full section-divider-warm" />
      
      <div className="mx-auto max-w-6xl relative z-10" ref={revealRef}>
        <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[44px] leading-tight max-w-4xl" data-reveal="up">
          From Reference to Directed Scene — Faster Than Prompt-Only Workflows
        </h2>
        <p className="mt-6 max-w-3xl text-[17px] leading-relaxed text-slate-300" data-reveal="up">
          Prompt-only workflows are slow. You finally get the face right, then the lighting changes. You fix the lighting, then the outfit changes. You adjust the outfit, then the scene falls apart. Cast Director Studio is built to reduce that cycle by giving creators a directed workflow for controlling the key parts of the image.
        </p>
        
        <div className="mt-12 relative">
          {/* Architectural dashed connector line (desktop only) */}
          <div className="hidden lg:block absolute top-[14px] left-[7px] right-[7px] h-[1px] border-t border-dashed border-white/[0.06] z-0" />
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5 relative z-10">
            {steps.map((step, index) => (
              <div key={step} className="relative flex flex-col group" data-reveal="up">
                {/* Connection dot */}
                <div className={`w-3.5 h-3.5 rounded-full mb-8 transition-all duration-500 border-2 ${
                  index === 0 
                    ? 'bg-nano-yellow border-nano-yellow/40 shadow-[0_0_12px_rgba(250,204,21,0.4)]' 
                    : 'bg-white/10 border-white/[0.08] group-hover:bg-nano-yellow group-hover:border-nano-yellow/60 group-hover:shadow-[0_0_16px_rgba(250,204,21,0.5)]'
                }`} />
                
                {/* Card */}
                <div className="p-6 rounded-[20px] border border-white/[0.03] bg-white/[0.01] flex flex-col min-h-[180px] transition-all duration-500 group-hover:border-nano-yellow/20 group-hover:bg-white/[0.04] group-hover:shadow-[0_8px_30px_-10px_rgba(250,204,21,0.12)]">
                  {/* Ghost step number */}
                  <div className="text-[56px] font-display font-black text-white/[0.04] group-hover:text-nano-yellow/20 transition-all duration-500 leading-none mb-4 select-none group-hover:drop-shadow-[0_0_20px_rgba(250,204,21,0.4)]">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  
                  <div className="text-[15px] leading-relaxed text-slate-300 mt-auto font-medium transition-colors duration-300 group-hover:text-white">
                    {step}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}