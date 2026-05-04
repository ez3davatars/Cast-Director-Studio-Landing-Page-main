import { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from 'framer-motion';

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
            Fast Creative Control for AI Production
          </div>

          {/* Headline */}
          <h1 className="mx-auto mt-8 w-full max-w-[820px] font-display text-[38px] sm:text-5xl md:text-6xl lg:text-[76px] font-extrabold tracking-tight text-white leading-[1.1] md:leading-[1.05]">
            <span className="block mb-1" style={{ textShadow: '0 2px 40px rgba(0,0,0,0.8), 0 0 80px rgba(250,204,21,0.12)' }}>
              Create Consistent AI Characters Faster.
            </span>
            <span className="block pb-1 bg-gradient-to-r from-nano-yellow via-[#FDE68A] to-[#FEF3C7] bg-clip-text text-transparent">
              With Director-Level Control.
            </span>
          </h1>

          {/* Paragraph */}
          <p className="mx-auto mt-8 max-w-[600px] text-[16px] leading-[1.8] text-slate-300 md:text-[18px]" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}>
            Cast Director Studio helps AI creators make consistent, production-ready visual assets faster — with reusable actors, clean subject lighting, wardrobe and props direction, character sheets, and scene control.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 relative z-30">
            <a href="#pricing" className="rounded-full bg-nano-yellow px-8 py-4 text-[15px] font-bold text-black transition-all hover:bg-[#eab308] shadow-[0_0_25px_rgba(250,204,21,0.3)] hover:shadow-[0_0_35px_rgba(250,204,21,0.5)] hover:-translate-y-0.5 tracking-[0.1em] ring-2 ring-nano-yellow/20 ring-offset-2 ring-offset-nano-abyss">
              VIEW PRICING
            </a>
            <a href="#workflow" className="rounded-full border border-white/10 bg-white/5 px-8 py-4 text-[15px] font-bold text-slate-300 transition-all hover:bg-white/10 hover:border-white/20 hover:text-white backdrop-blur-sm tracking-[0.1em]">
              SEE HOW IT WORKS
            </a>
          </div>

          {/* Sub-CTA tagline */}
          <p className="mx-auto mt-5 max-w-[560px] text-[13px] leading-relaxed text-slate-400 tracking-wide">
            Built for creators who need consistent characters, production-ready subject lighting, and faster production workflows.
          </p>

          {/* Feature Cards — normal flow, pushed lower */}
          <div className="relative z-30 mt-20 w-full lg:mt-24 xl:mt-28">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-300 max-w-[900px] mx-auto">
              <div className="group rounded-2xl px-6 py-5 flex items-start gap-4 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:bg-white/[0.05] backdrop-blur-sm">
                <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-nano-yellow/10 border border-nano-yellow/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-nano-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-white mb-1">Reusable Actors</div>
                  <div className="text-[13px] leading-relaxed text-slate-400">Create once, direct across multiple shots.</div>
                </div>
              </div>
              <div className="group rounded-2xl px-6 py-5 flex items-start gap-4 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:bg-white/[0.05] backdrop-blur-sm">
                <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-white mb-1">Studio Subject Lighting</div>
                  <div className="text-[13px] leading-relaxed text-slate-400">Generate clean, readable actors, outfits, products, and characters for image and video workflows.</div>
                </div>
              </div>
              <div className="group rounded-2xl px-6 py-5 flex items-start gap-4 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:bg-white/[0.05] backdrop-blur-sm">
                <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-white mb-1">Wardrobe, Props & Scenes</div>
                  <div className="text-[13px] leading-relaxed text-slate-400">Guide outfits, accessories, objects, and environments faster.</div>
                </div>
              </div>
              <div className="group rounded-2xl px-6 py-5 flex items-start gap-4 bg-nano-yellow/[0.04] border border-nano-yellow/20 hover:border-nano-yellow/40 transition-all duration-300 hover:bg-nano-yellow/[0.07] backdrop-blur-sm shadow-[0_0_30px_-10px_rgba(250,204,21,0.1)]">
                <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-nano-yellow/15 border border-nano-yellow/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-nano-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-nano-yellow mb-1">Desktop-First Control</div>
                  <div className="text-[13px] leading-relaxed text-slate-300">Keep tighter control over your workflow, references, and creative assets.</div>
                </div>
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