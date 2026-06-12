import React, { useState } from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';

const faqItems = [
  {
    q: 'What makes Cast Director Studio different from a regular AI image generator?',
    a: 'Most AI image generators create images from prompts. Cast Director Studio helps creators direct the process with guided controls for lighting, wardrobe, props, scenes, visual references, and production-ready outputs, all from a desktop-first creative workflow.',
  },
  {
    q: 'What is reference-guided photo upload?',
    a: 'Reference-guided photo upload lets creators add source images that act as visual anchors for people, clients, spokespeople, characters, or brand personalities. It helps communicate creative intent to the generation workflow, but it is not guaranteed face cloning or identity reproduction.',
  },
  {
    q: 'What can I create with it?',
    a: 'Creators can work on spokespeople, brand mascots, thumbnail characters, product models, digital doubles, storytelling characters, social media personalities, and marketing visuals across multiple styles and production needs.',
  },
  {
    q: 'What are production reference sheets?',
    a: 'Production reference sheets are structured visual outputs such as multi-angle references, expression maps, wardrobe guides, style guides, and lighting references. They are designed to support downstream AI workflows, video generation, animation, storytelling, branding, and marketing content.',
  },
  {
    q: 'What is the main advantage of Cast Director Studio?',
    a: 'The main advantage is faster creative direction. Instead of relying only on long prompt rewrites, creators can guide lighting, wardrobe, props, references, and scenes through structured controls that reduce friction and help move ideas toward usable assets.',
  },
  {
    q: 'Does Cast Director Studio guarantee perfect consistency?',
    a: 'No. AI generation can still vary between outputs. Cast Director Studio is designed to reduce prompt iteration, strengthen visual references, and make creative intent easier to communicate, not eliminate all model drift.',
  },
  {
    q: 'Why is speed important for AI creators?',
    a: 'AI creators often spend too much time rebuilding ideas and re-explaining visual intent. Guided controls help creators iterate faster, compare directions more easily, and keep references organized as projects move toward production.',
  },
  {
    q: 'Does the app support digital doubles?',
    a: 'Yes. Cast Director Studio supports digital double workflows for creative use through reference photos and guided capture. These references provide stronger visual foundations, but results still depend on input quality, model behavior, and creative settings.',
  },
  {
    q: 'Is Cast Director Studio local or cloud-based?',
    a: "Cast Director Studio is a desktop-first app. Creators keep projects, references, character sheets, and creative assets under their control while generation requests are handled through Gemini via either their own API key or EZ3D Avatars' managed credit access.",
  },
  {
    q: 'What is the difference between BYOK and credits?',
    a: "Both options use the same app and the same creative controls. BYOK means you generate using your own Gemini API key for direct usage pricing. Credits mean you use EZ3D Avatars' managed API access for a simpler setup.",
  },
  {
    q: 'Will Cast Director Studio support other AI image models in the future?',
    a: 'Cast Director Studio is designed as a provider-aware creative workflow that can evolve with leading AI image models. Additional provider support may be evaluated where API access, quality, pricing, and creator needs make sense.',
  },
  {
    q: 'How do Generation Credits work?',
    a: 'Generation Credits are based on render size. A standard high-quality 1K generation uses 1 Credit. A 2K widescreen image or production reference sheet uses 2 Credits. An ultra-high 4K generation uses 6 Credits. BYOK users do not consume credits; they use their own API key and are billed directly by their provider.',
  },
  {
    q: 'How is generation data handled?',
    a: "Projects, references, character sheets, and creative assets remain under your control while Gemini securely handles generation requests through its API. Google's handling of submitted data is governed by its applicable terms and policies.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number>(0);
  const revealRef = useScrollReveal({ staggerDelay: 150 });

  return (
    <section id="faq" className="px-6 py-32 relative z-10">
      <div className="absolute inset-0 bg-gradient-to-b from-[#060e1f] to-nano-abyss pointer-events-none" />
      <div className="absolute top-0 left-0 w-full section-divider-warm" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-500/[0.03] blur-[150px] rounded-full pointer-events-none" />

      <div className="mx-auto max-w-3xl relative z-10" ref={revealRef}>
        <div className="text-center mb-12" data-reveal="up">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[40px]">
            Frequently Asked Questions
          </h2>
          <div className="w-16 h-[2px] bg-nano-yellow/40 mx-auto mt-4 rounded-full" />
        </div>
        <div className="space-y-3">
          {faqItems.map((item, index) => {
            const isOpen = index === openIndex;
            return (
              <div
                key={item.q}
                className={`rounded-2xl transition-all duration-300 ${isOpen
                  ? 'bg-white/[0.03] border border-white/10 border-l-2 border-l-nano-yellow/40'
                  : 'bg-white/[0.01] border border-white/[0.02] border-l-2 border-l-transparent hover:bg-white/[0.02]'}`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                >
                  <h3 className={`font-display text-[17px] font-semibold pr-8 transition-colors ${isOpen ? 'text-white' : 'text-slate-400'}`}>
                    {item.q}
                  </h3>
                  <div className={`relative w-3.5 h-3.5 shrink-0 flex items-center justify-center transition-colors duration-300 ${isOpen ? 'text-nano-yellow' : 'text-slate-600'}`}>
                    <span className="absolute w-full h-[2px] bg-current rounded-full transition-transform duration-300" />
                    <span className={`absolute h-full w-[2px] bg-current rounded-full transition-transform duration-300 ${isOpen ? 'rotate-90 scale-0' : ''}`} />
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
                  aria-hidden={!isOpen}
                >
                  <div className="px-6 pb-6 pt-2">
                    <p className="text-[16px] leading-relaxed text-slate-400">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
