import { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from 'framer-motion';

const heroBenefits = [
  {
    title: 'Guided Creative Workflows',
    body: 'Choose style, lighting, wardrobe, props, and scene direction without writing complex prompts from scratch.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m4-2a8 8 0 11-16 0 8 8 0 0116 0z" />
    ),
  },
  {
    title: 'Built-In Prompt Intelligence',
    body: 'Cast Director Studio translates your selections into carefully structured AI instructions for Gemini.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5m-7.5 4.5h10.5m-12 4.5h13.5m-10.5 4.5h7.5m-4.5 3h1.5" />
    ),
  },
  {
    title: 'Faster Production Iteration',
    body: 'Move from idea to usable visual assets with less prompt experimentation and less trial-and-error.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0011.95 2.95M18.5 9A7 7 0 006.55 6.05" />
    ),
  },
  {
    title: 'Desktop-First Asset Control',
    body: 'Keep projects, references, character sheets, and creative assets organized under your control.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5A2.5 2.5 0 016.5 5H10l2 2h5.5A2.5 2.5 0 0120 9.5v7A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-9z" />
    ),
  },
];

export default function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // ─── Scroll Progress ───
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 30,
    restDelta: 0.001,
  });

  // ─── Female (Left) Scroll Transforms ───
  const femaleX = useTransform(smoothProgress, [0, 0.7], [0, -240]);
  const femaleOpacity = useTransform(smoothProgress, [0, 0.6], [1, 0]);
  const femaleScale = useTransform(smoothProgress, [0, 0.7], [1, 0.96]);
  const femaleBlur = useTransform(smoothProgress, [0, 0.6], [0, 2]);

  // ─── Male (Right) Scroll Transforms ───
  const maleX = useTransform(smoothProgress, [0, 0.7], [0, 240]);
  const maleOpacity = useTransform(smoothProgress, [0, 0.6], [1, 0]);
  const maleScale = useTransform(smoothProgress, [0, 0.7], [1, 0.96]);
  const maleBlur = useTransform(smoothProgress, [0, 0.6], [0, 2]);

  // ─── Fade-in on Mount ───
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const femaleFilter = useTransform(femaleBlur, (v) => `blur(${v}px)`);
  const maleFilter = useTransform(maleBlur, (v) => `blur(${v}px)`);

  return (
    <section id="hero" ref={heroRef} className="relative overflow-hidden bg-[#03050a] text-white">
      <div className="hero-shell relative min-h-[940px] overflow-hidden lg:min-h-[1000px] xl:min-h-[1040px]">

        {/* ─── Background Atmosphere ─── */}
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,214,10,0.13),transparent_34%)]" />
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_14%_45%,rgba(30,80,180,0.14),transparent_32%)]" />
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_86%_45%,rgba(255,214,10,0.08),transparent_34%)]" />
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black/10 via-transparent to-[#03050a]" />

        {/* ─── Character: Female (Left) ─── */}
        <motion.div
          className="hero-character hero-character-left"
          style={
            prefersReducedMotion
              ? {}
              : {
                  x: femaleX,
                  opacity: femaleOpacity,
                  scale: femaleScale,
                  filter: femaleFilter,
                }
          }
          aria-hidden="true"
        >
          <div className="hero-character__glow hero-character__glow--left" />
          <img
            src="/hero-female.png"
            alt=""
            className={`hero-character__img hero-character__img--left ${mounted ? 'hero-character__img--visible' : ''}`}
            loading="eager"
            draggable={false}
          />
        </motion.div>

        {/* ─── Character: Male (Right) ─── */}
        <motion.div
          className="hero-character hero-character-right"
          style={
            prefersReducedMotion
              ? {}
              : {
                  x: maleX,
                  opacity: maleOpacity,
                  scale: maleScale,
                  filter: maleFilter,
                }
          }
          aria-hidden="true"
        >
          <div className="hero-character__glow hero-character__glow--right" />
          <img
            src="/hero-male.png"
            alt=""
            className={`hero-character__img hero-character__img--right ${mounted ? 'hero-character__img--visible' : ''}`}
            loading="eager"
            draggable={false}
          />
        </motion.div>

        {/* ─── Center Content Stack ─── */}
        <div className="relative z-20 mx-auto flex min-h-[940px] max-w-[820px] flex-col items-center px-6 pt-24 text-center lg:min-h-[1000px] xl:min-h-[1040px]">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-nano-yellow/30 bg-nano-yellow/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-nano-yellow backdrop-blur-sm shadow-[0_0_20px_rgba(250,204,21,0.15)]">
            <span className="h-1.5 w-1.5 rounded-full bg-nano-yellow animate-pulse" />
            Gemini-Powered Creative Production
          </div>

          {/* Headline */}
          <h1 className="mx-auto mt-8 w-full max-w-[820px] font-display text-[38px] sm:text-5xl md:text-6xl lg:text-[76px] font-extrabold tracking-tight text-white leading-[1.1] md:leading-[1.05]">
            <span className="block mb-1" style={{ textShadow: '0 2px 40px rgba(0,0,0,0.8), 0 0 80px rgba(250,204,21,0.12)' }}>
              Professional AI Visuals
            </span>
            <span className="block pb-1 bg-gradient-to-r from-nano-yellow via-[#FDE68A] to-[#FEF3C7] bg-clip-text text-transparent">
              Without Prompt Engineering
            </span>
          </h1>

          {/* Paragraph */}
          <p className="mx-auto mt-8 max-w-[600px] text-[16px] leading-[1.8] text-slate-300 md:text-[18px]" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}>
            Create production-ready characters, spokespeople, mascots, digital doubles, marketing visuals, and AI video foundations through guided creative workflows built on Gemini.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 relative z-30">
            <a href="#workflow" className="rounded-full border border-white/10 bg-white/5 px-8 py-4 text-[15px] font-bold text-slate-300 transition-all hover:bg-white/10 hover:border-white/20 hover:text-white backdrop-blur-sm tracking-[0.1em]">
              SEE HOW IT WORKS
            </a>
            <a href="#pricing" className="rounded-full bg-nano-yellow px-8 py-4 text-[15px] font-bold text-black transition-all hover:bg-[#eab308] shadow-[0_0_25px_rgba(250,204,21,0.3)] hover:shadow-[0_0_35px_rgba(250,204,21,0.5)] hover:-translate-y-0.5 tracking-[0.1em] ring-2 ring-nano-yellow/20 ring-offset-2 ring-offset-nano-abyss">
              VIEW PRICING
            </a>
          </div>

          {/* Sub-CTA tagline */}
          <p className="mx-auto mt-5 max-w-[560px] text-[13px] leading-relaxed text-slate-400 tracking-wide">
            Make creative selections. Cast Director Studio translates them into optimized AI instructions behind the scenes.
          </p>

          {/* Feature Rail — Premium Director Control Rail */}
          <div className="self-start relative left-1/2 z-30 mt-20 w-[min(1180px,calc(100vw-48px))] -translate-x-1/2 lg:mt-24 xl:mt-28">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/75 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-md">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-nano-yellow/[0.04]" />
              
              <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 text-left">
                {heroBenefits.map((benefit) => (
                  <div key={benefit.title} className="group relative min-h-[154px] overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-5 transition duration-300 hover:-translate-y-1 hover:border-nano-yellow/35 hover:bg-white/[0.06]">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:via-nano-yellow/40 transition-colors duration-300" />
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-nano-yellow/10 transition-colors duration-500" />
                    <div className="relative flex flex-col gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-nano-yellow/10 group-hover:border-nano-yellow/30 transition-all duration-300 shadow-[0_0_15px_rgba(255,255,255,0.02)] group-hover:shadow-[0_0_20px_rgba(250,204,21,0.15)]">
                        <svg className="w-4 h-4 text-white group-hover:text-nano-yellow transition-colors duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          {benefit.icon}
                        </svg>
                      </div>
                      <div>
                        <div className="text-[15px] font-semibold text-white mb-1 group-hover:text-nano-yellow transition-colors duration-300">{benefit.title}</div>
                        <div className="text-[13px] leading-relaxed text-slate-400">{benefit.body}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Bottom Gradient ─── */}
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-[1]"
          style={{
            background: 'linear-gradient(to top, #03050a 0%, rgba(3,5,10,0.7) 40%, transparent 100%)',
          }}
        />
      </div>

      {/* ─── Director's Monitor ─── */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="w-full max-w-[1000px] mx-auto mt-8 relative perspective-1000 z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] h-[55%] bg-nano-yellow/15 blur-[100px] rounded-full pointer-events-none z-0" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-8 bg-nano-yellow/5 blur-[20px] rounded-full pointer-events-none z-0 transform rotate-2" />

          <div className="relative glass-panel-elite rounded-[32px] aspect-[16/10] flex items-center justify-center z-20 shadow-[0_20px_80px_-20px_rgba(0,0,0,1)] ring-1 ring-white/10 mx-auto w-[85%] md:w-full">
            <div className="absolute inset-2 md:inset-3 bg-nano-abyss rounded-[24px] overflow-hidden flex flex-col scanline-overlay">
              <div className="h-10 bg-white/[0.02] border-b border-white/5 flex items-center px-6 justify-between">
                <div className="text-[10px] text-nano-yellow font-display tracking-widest uppercase flex items-center gap-2 font-semibold">
                  <span className="w-2 h-2 bg-nano-yellow rounded-full animate-glow-pulse" />
                  APPLICATION ACTIVE
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                </div>
              </div>
              <div className="flex-1 relative">
                <img
                  src="/hero-render.png"
                  alt="AI character with production-ready subject lighting — studio render from Cast Director Studio"
                  className="w-full h-full object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-nano-abyss/40 via-transparent to-transparent pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="absolute top-[15%] -left-[5%] md:-left-[12%] w-[45%] md:w-[35%] aspect-[4/5] glass-panel-premium rounded-[20px] p-2 z-30 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] hidden sm:block transform -rotate-2 hover:rotate-0 transition-all duration-500 hover:z-40 hover:border-amber-900/30 animate-float">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex flex-col overflow-hidden relative">
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur border border-white/10 px-2 py-1 rounded text-[9px] text-slate-300 font-mono tracking-wider z-10">
                WARDROBE_TEST_A
              </div>
              <img
                src="/wardrobe-test.png"
                alt="Wardrobe styling test for AI character — professional lighting reference"
                className="w-full h-full object-cover rounded-[14px]"
                loading="eager"
              />
            </div>
          </div>

          <div className="absolute -bottom-[5%] -right-[5%] md:-right-[8%] w-[50%] md:w-[40%] aspect-[16/9] glass-panel-premium rounded-[20px] p-2 z-10 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.6)] hidden sm:block transform rotate-3 hover:rotate-0 transition-all duration-500 hover:z-40 animate-float-delayed">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex flex-col overflow-hidden relative border border-white/5">
              <div className="absolute bottom-3 right-3 bg-nano-yellow/20 backdrop-blur border border-nano-yellow/30 px-2 py-1 rounded text-[9px] text-nano-yellow font-mono tracking-wider z-10 shadow-[0_0_12px_rgba(250,204,21,0.3)]">
                LIGHTING_MATCH_100%
              </div>
              <img
                src="/lighting-match.png"
                alt="Before and after lighting refinement — showing production-ready subject lighting improvement"
                className="w-full h-full object-cover rounded-[14px]"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
