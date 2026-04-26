import { useScrollReveal } from '../hooks/useScrollReveal';

export default function DigitalDoubles() {
  const revealRef = useScrollReveal({ staggerDelay: 250 });
  return (
    <section id="digital-doubles" className="px-6 py-20 relative overflow-hidden">
      {/* Section atmosphere */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#030712] via-nano-surface1 to-nano-abyss pointer-events-none" />
      <div className="absolute top-0 left-0 w-full section-divider-cool" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-blue-500/[0.03] blur-[180px] rounded-full pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10" ref={revealRef}>
        {/* Two-column: copy left, images right — vertically centered */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          {/* Left Column: Core messaging */}
          <div className="lg:col-span-5" data-reveal="left">
            <div className="flex flex-col gap-3 mb-6">
              <div className="w-10 h-[3px] rounded-full bg-blue-500/60" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400">
                Reference-Guided Character Pipeline
              </span>
            </div>

            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[44px] leading-[1.1]">
              Reference-Guided Photo Upload & Webcam Face Capture for High-Quality Digital Doubles
            </h2>

            <div className="mt-6 space-y-4 text-[16px] leading-relaxed text-slate-300">
              <p>
                Cast Director Studio includes reference-guided photo upload and webcam face capture workflows for building stronger character identity foundations. Creators can upload source photos or capture a guided face reference to help create high-quality digital doubles and character likenesses with stronger facial alignment and visual consistency.
              </p>
              <p>
                This is not identity verification or guaranteed face cloning — it is a creative reference workflow that gives the AI a stronger visual anchor, so creators spend less time trying to prompt the same face back into existence.
              </p>
            </div>

            {/* Compact value indicators */}
            <div className="mt-8 space-y-3">
              {[
                { title: 'Photo Upload & Webcam Capture', desc: 'Use source photos or guided webcam capture to create stronger face and character references for creative production.' },
                { title: 'Stronger Identity Retention', desc: 'Reference-guided capture creates a richer visual anchor for more repeatable character likeness across generations and scenes.' },
                { title: 'Creative Reference Workflow', desc: 'Designed for digital doubles, character likenesses, and visual consistency — not identity verification or guaranteed face cloning.' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-blue-500/60 shrink-0 shadow-[0_0_6px_rgba(59,130,246,0.3)]" />
                  <div>
                    <h3 className="text-white font-semibold text-[15px]">{item.title}</h3>
                    <p className="text-slate-400 text-[14px] mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Stacked images — constrained height */}
          <div className="lg:col-span-7 space-y-5" data-reveal="right">
            {/* Primary: Facial acquisition scan */}
            <div className="glass-panel-elite rounded-[28px] p-1.5 relative overflow-hidden ring-1 ring-blue-500/10 group transition-transform duration-300 hover:-translate-y-1">
              <div className="absolute top-0 left-0 w-[250px] h-[250px] bg-blue-500/10 blur-[80px] rounded-full pointer-events-none" />
              <div className="relative rounded-[22px] overflow-hidden">
                <img 
                  src="/facial-acquisition.png"
                  alt="Guided face reference capture — geometric facial landmark points and character likeness mapping for AI digital doubles"
                  className="w-full h-auto object-cover max-h-[340px]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-nano-abyss/50 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md border border-blue-500/20 px-3 py-1.5 rounded-lg text-[10px] text-blue-300 font-display tracking-widest uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                  Face Reference Capture
                </div>
              </div>
            </div>
            
            {/* Secondary: Source → Digital Double comparison */}
            <div className="glass-panel-premium rounded-[20px] p-1.5 relative overflow-hidden group transition-transform duration-300 hover:-translate-y-1">
              <div className="relative rounded-[14px] overflow-hidden">
                <img 
                  src="/digital-double.png"
                  alt="Source photo to digital double — quality uplift from photo input to polished AI character output"
                  className="w-full h-auto object-cover max-h-[260px]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-nano-abyss/40 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-[10px] text-slate-300 font-display tracking-widest uppercase">
                  Source → Digital Double
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
