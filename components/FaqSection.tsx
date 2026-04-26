import React, { useState } from 'react';

const faqItems = [
  {
    q: 'What makes Cast Director Studio different from a regular AI image generator?',
    a: 'Regular AI image generators often rely on prompt trial-and-error. Cast Director Studio is built around directed control, helping creators work with reusable actors, production-ready subject lighting, wardrobe, props, scenes, and character references in a faster production workflow \u2014 all from a local desktop app.',
  },
  {
    q: 'What is reference-guided photo upload?',
    a: 'Reference-guided photo upload is a workflow where creators upload source photos to build stronger character identity foundations. The system uses facial geometry and features to create a visual anchor that improves identity retention across generative sessions. It is not guaranteed identity cloning \u2014 it is a professional-grade capture workflow that gives characters a stronger, more consistent starting point.',
  },
  {
    q: 'Can I create characters beyond photorealistic humans?',
    a: 'Yes. Creators can work with humans, animals, mascots, stylized characters, illustrated characters, sci-fi characters, anime characters, and brand-driven digital actors. The same subject lighting system and directed workflow applies across all styles.',
  },
  {
    q: 'What are character sheets and reference sheets?',
    a: 'Character sheets are structured visual reference outputs \u2014 including multi-angle views, expression maps, wardrobe sheets, and style guides \u2014 that capture a character\'s visual identity in a format designed for downstream generative AI workflows, video pipelines, and production tools. They help authors, comic creators, AI filmmakers, and brand storytellers maintain stronger visual consistency across sessions.',
  },
  {
    q: 'What is the main advantage of Cast Director Studio?',
    a: 'The main advantage is faster creative control. Instead of wrestling with prompts to get consistent results, creators can direct reusable AI actors, clean subject lighting, wardrobe, props, and scenes through guided controls \u2014 helping them produce more consistent, production-ready visual assets for AI image and video workflows.',
  },
  {
    q: 'Does Cast Director Studio help with character consistency?',
    a: 'Yes. The workflow is designed to help creators maintain stronger visual consistency across actors, outfits, lighting styles, scenes, and character sheets. Reference-guided identity capture and structured creative controls reduce the cycle of regenerating images to fix one detail while another detail breaks.',
  },
  {
    q: 'Why is speed important for AI creators?',
    a: 'AI creators often lose hours regenerating images to fix one detail while another detail breaks. Cast Director Studio is designed to reduce that cycle by turning key creative decisions into a more guided workflow \u2014 so creators can move faster without starting from zero every time.',
  },
  {
    q: 'Does the app support digital doubles?',
    a: 'Yes. Cast Director Studio includes reference-guided photo upload tools that can help creators build high-quality digital doubles and character likenesses for creative use. The feature is designed as a creative reference tool for stronger facial alignment and visual consistency.',
  },
  {
    q: 'Is Cast Director Studio local or cloud-based?',
    a: "Cast Director Studio is a local desktop app. Because it is built as a desktop-first creative tool, creators keep tighter control over their workflow and assets. The features stay the same whether you use your own Gemini API key or use EZ3D Avatars' credit-based access.",
  },
  {
    q: 'What is the difference between BYOK and credits?',
    a: "Both options use the same app and the same tools. BYOK means you generate using your own Gemini API key. Credits means you generate using EZ3D Avatars' API access, with packages that can include preloaded credits and the option to purchase more as needed.",
  },
  {
    q: 'Will Cast Director Studio support other AI image models in the future?',
    a: "Cast Director Studio is designed as a provider-aware creative workflow that can evolve with leading AI image models. As new model options become available, additional provider support may be evaluated where API access, quality, pricing, and product fit make sense. The creative direction system is built to work across model capabilities as they advance.",
  },
];

import { useScrollReveal } from '../hooks/useScrollReveal';

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number>(0);
  const revealRef = useScrollReveal({ staggerDelay: 150 });

  return (
    <section id="faq" className="px-6 py-32 relative z-10">
      {/* Section atmosphere */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#060e1f] to-nano-abyss pointer-events-none" />
      <div className="absolute top-0 left-0 w-full section-divider-warm" />
      {/* Centered blue glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-500/[0.03] blur-[150px] rounded-full pointer-events-none" />

      <div className="mx-auto max-w-3xl relative z-10" ref={revealRef}>
        <div className="text-center mb-12" data-reveal="up">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-[40px]">
            Frequently Asked Questions
          </h2>
          {/* Amber underline accent */}
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
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                >
                  <h3 className={`font-display text-[17px] font-semibold pr-8 transition-colors ${isOpen ? 'text-white' : 'text-slate-400'}`}>
                    {item.q}
                  </h3>
                  <div className={`relative w-3.5 h-3.5 shrink-0 flex items-center justify-center transition-colors duration-300 ${isOpen ? 'text-nano-yellow' : 'text-slate-600'}`}>
                    {/* Horizontal line (always visible) */}
                    <span className="absolute w-full h-[2px] bg-current rounded-full transition-transform duration-300" />
                    {/* Vertical line (rotates and disappears when open) */}
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
