import { useScrollReveal } from '../hooks/useScrollReveal';

const youtubeVideoId = 'u3xxhrSDRpQ';
const youtubeEmbedUrl = `https://www.youtube-nocookie.com/embed/${youtubeVideoId}?rel=0&modestbranding=1&playsinline=1`;

const aiVideoWorkflow = [
  'Cast Director Studio',
  'Studio-Quality Reference Images',
  'Veo 3.1',
  'Final Talking Avatar',
];

export default function DigitalDoubles() {
  const revealRef = useScrollReveal({ staggerDelay: 250 });

  return (
    <section id="digital-doubles" className="px-6 py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#030712] via-nano-surface1 to-nano-abyss pointer-events-none" />
      <div className="absolute top-0 left-0 w-full section-divider-cool" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-blue-500/[0.03] blur-[180px] rounded-full pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10" ref={revealRef}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-5" data-reveal="left">
            <div className="flex flex-col gap-3 mb-6">
              <div className="w-10 h-[3px] rounded-full bg-blue-500/60" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400">
                Reference-Guided Starting Points
              </span>
            </div>

            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[44px] leading-[1.1]">
              Turn Photos Into Better Starting Points
            </h2>

            <div className="mt-6 space-y-4 text-[16px] leading-relaxed text-slate-300">
              <p>
                Upload reference photos or use guided capture to provide Gemini with stronger visual context.
              </p>
              <p>
                Whether creating yourself, a client, a spokesperson, a mascot, or a fictional character, stronger references can help reduce guesswork and improve results.
              </p>
              <p>
                This is a creative reference workflow, not identity verification or guaranteed face cloning.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              {[
                { title: 'Photo Upload & Guided Capture', desc: 'Provide stronger visual context with source photos or guided reference capture.' },
                { title: 'Better Creative Anchors', desc: 'Use references to reduce guesswork when exploring spokespeople, mascots, fictional characters, and client visuals.' },
                { title: 'Reference-Aware Iteration', desc: 'Keep visual inputs connected to the project so future directions start from clearer context.' },
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

          <div className="lg:col-span-7 space-y-5" data-reveal="right">
            <div className="glass-panel-elite rounded-[28px] p-1.5 relative overflow-hidden ring-1 ring-blue-500/10 group transition-transform duration-300 hover:-translate-y-1">
              <div className="absolute top-0 left-0 w-[250px] h-[250px] bg-blue-500/10 blur-[80px] rounded-full pointer-events-none" />
              <div className="relative rounded-[22px] overflow-hidden">
                <img
                  src="/facial-acquisition.png"
                  alt="Guided face reference capture with facial landmark points for stronger AI visual context"
                  className="w-full h-auto object-cover max-h-[340px]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-nano-abyss/50 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md border border-blue-500/20 px-3 py-1.5 rounded-lg text-[10px] text-blue-300 font-display tracking-widest uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                  Reference Capture
                </div>
              </div>
            </div>

            <div className="glass-panel-premium rounded-[20px] p-1.5 relative overflow-hidden group transition-transform duration-300 hover:-translate-y-1">
              <div className="relative rounded-[14px] overflow-hidden">
                <img
                  src="/digital-double.png"
                  alt="Source photo converted into a polished AI visual starting point"
                  className="w-full h-auto object-cover max-h-[260px]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-nano-abyss/40 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-[10px] text-slate-300 font-display tracking-widest uppercase">
                  Photo To Starting Point
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-20 lg:mt-28" data-reveal="up">
          <div className="relative overflow-hidden rounded-[32px] border border-cyan-300/10 bg-gradient-to-br from-white/[0.06] via-slate-950/70 to-blue-950/20 p-4 shadow-[0_32px_100px_rgba(0,0,0,0.48)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-[100px]" />
            <div className="pointer-events-none absolute -bottom-28 left-1/4 h-80 w-80 rounded-full bg-blue-500/10 blur-[120px]" />
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />

            <div className="relative rounded-[26px] border border-white/10 bg-black/30 p-5 md:p-8">
              <div className="max-w-4xl">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                    Sample AI Video Workflow
                  </span>
                  <h3 className="mt-4 font-display text-3xl font-bold tracking-tight text-white md:text-[42px] leading-[1.1]">
                    See the Workflow in Motion
                  </h3>
                </div>
              </div>

              <div className="mt-8 relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(103,232,249,0.12),transparent_38%)] pointer-events-none" />
                <div className="relative aspect-video">
                  <iframe
                    className="absolute inset-0 h-full w-full"
                    src={youtubeEmbedUrl}
                    title="Cast Director Studio sample AI video workflow"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
                {aiVideoWorkflow.map((step, index) => (
                  <div key={step} className="group relative rounded-[20px] border border-white/10 bg-white/[0.035] p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/25 hover:bg-cyan-300/[0.055]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <p className="mt-4 text-[14px] font-semibold leading-snug text-white">
                      {step}
                    </p>
                    {index < aiVideoWorkflow.length - 1 && (
                      <div className="hidden md:block absolute right-[-12px] top-1/2 h-px w-6 bg-gradient-to-r from-cyan-300/45 to-transparent" />
                    )}
                    {index < aiVideoWorkflow.length - 1 && (
                      <div className="md:hidden mx-auto mt-4 h-5 w-px bg-gradient-to-b from-cyan-300/45 to-transparent" />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[24px] border border-cyan-300/15 bg-cyan-300/[0.055] p-6">
                <h4 className="font-display text-xl font-bold text-white">
                  Production Workflow Example
                </h4>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
                  The talking avatar featured above was created in Veo 3.1 using studio-quality reference images generated in Cast Director Studio. This example demonstrates how creators can develop stronger visual foundations before moving into AI video workflows.
                </p>
              </div>

              <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-[12px] leading-relaxed text-slate-500">
                Preview Note: Portions of this demonstration have been accelerated for presentation purposes. Actual generation and rendering times may vary based on model availability, provider performance, network conditions, workflow complexity, and selected settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
