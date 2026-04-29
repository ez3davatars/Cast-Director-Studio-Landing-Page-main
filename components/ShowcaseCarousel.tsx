import React, { useCallback, useEffect, useState, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronLeft, ChevronRight, Zap, Clock, Layers, FileText } from 'lucide-react';
import { showcaseSlides } from '../data/showcaseSlides';
import ShowcaseLightbox from './ShowcaseLightbox';
import { useScrollReveal } from '../hooks/useScrollReveal';

/* ─── Performance proof data ─── */
const PERF_CARDS = [
  {
    icon: Zap,
    label: '1K Generations',
    stat: '26–30 seconds',
    note: 'Based on 3 test runs',
  },
  {
    icon: Clock,
    label: '2K Generations',
    stat: '33–38 seconds',
    note: 'Based on 3 test runs',
  },
  {
    icon: Layers,
    label: '4K Generations',
    stat: '45–57 seconds',
    note: 'Based on 5 test runs',
  },
  {
    icon: FileText,
    label: 'Reference Sheets',
    stat: '70–90 seconds',
    note: '',
  },
];

export default function ShowcaseCarousel() {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const autoplayPlugin = useRef(
    Autoplay({
      delay: 4500,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
      playOnInit: !prefersReduced,
    }),
  );

  /* Once the user takes manual control (arrow, swipe, click), autoplay
     stops permanently for the rest of the page session. */
  const userStopped = useRef(false);
  const killAutoplay = useCallback(() => {
    userStopped.current = true;
    autoplayPlugin.current.stop();
  }, []);

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'center',
      containScroll: false,
      skipSnaps: false,
    },
    [autoplayPlugin.current],
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const scrollPrev = useCallback(() => { killAutoplay(); emblaApi?.scrollPrev(); }, [emblaApi, killAutoplay]);
  const scrollNext = useCallback(() => { killAutoplay(); emblaApi?.scrollNext(); }, [emblaApi, killAutoplay]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    /* If the user took manual control, ensure autoplay stays dead
       (stopOnInteraction:false means the plugin may try to restart). */
    if (userStopped.current) autoplayPlugin.current.stop();
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    // Permanently stop autoplay on any user-initiated drag/swipe
    emblaApi.on('pointerDown', killAutoplay);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
      emblaApi.off('pointerDown', killAutoplay);
    };
  }, [emblaApi, onSelect, killAutoplay]);

  /* Lightbox navigation */
  const openLightbox = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);
  const lightboxPrev = () =>
    setLightboxIndex((i) => (i === null ? 0 : (i - 1 + showcaseSlides.length) % showcaseSlides.length));
  const lightboxNext = () =>
    setLightboxIndex((i) => (i === null ? 0 : (i + 1) % showcaseSlides.length));

  const revealRef = useScrollReveal({ staggerDelay: 200 });
  const perfRevealRef = useScrollReveal({ staggerDelay: 150 });

  return (
    <>
      {/* ═══════════════════════════════════════════════════
          SHOWCASE CAROUSEL SECTION
          ═══════════════════════════════════════════════════ */}
      <section
        id="showcase"
        className="relative py-28 overflow-hidden"
        aria-label="Made With Cast Director Studio"
      >
        {/* Atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#030712] via-[#060e1f] to-[#030712] pointer-events-none" />
        <div className="absolute top-0 left-0 w-full section-divider-cool" />
        {/* Cinematic glow behind carousel */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[60%] bg-blue-600/[0.04] blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[40%] h-[3px] bg-nano-yellow/[0.04] blur-[30px] pointer-events-none" />

        <div className="relative z-10 container mx-auto px-6" ref={revealRef}>
          {/* Header */}
          <div className="max-w-3xl mx-auto text-center mb-16" data-reveal="up">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-nano-yellow/40" />
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-nano-yellow font-display">
                Gallery
              </span>
              <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-nano-yellow/40" />
            </div>
            <h2 className="font-display text-3xl md:text-[44px] font-bold tracking-tight text-white leading-[1.1]">
              Made With Cast Director Studio
            </h2>
            <p className="mt-6 text-[16px] md:text-[17px] leading-relaxed text-slate-300 max-w-2xl mx-auto">
              Explore sample AI actors, digital doubles, character portraits, wardrobe concepts,
              and production-ready avatar visuals created with Cast Director Studio. These examples
              show how creators can build visually compelling, reusable characters for AI video,
              storytelling, thumbnails, branding, and content creation.
            </p>
          </div>

          {/* Embla Carousel */}
          <div className="relative" data-reveal="scale">
            {/* Nav arrows */}
            <button
              onClick={scrollPrev}
              className="absolute left-2 md:-left-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 hover:border-white/20 transition-all backdrop-blur-sm shadow-lg"
              aria-label="Previous slide"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={scrollNext}
              className="absolute right-2 md:-right-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 hover:border-white/20 transition-all backdrop-blur-sm shadow-lg"
              aria-label="Next slide"
            >
              <ChevronRight size={20} />
            </button>

            {/* Viewport */}
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex touch-pan-y -ml-4">
                {showcaseSlides.map((slide, idx) => {
                  const isActive = idx === selectedIndex;
                  return (
                    <div
                      key={slide.id}
                      className="flex-[0_0_78%] sm:flex-[0_0_55%] md:flex-[0_0_42%] lg:flex-[0_0_36%] pl-4"
                    >
                      {/* Inner wrapper for visual effects — Embla never touches this element */}
                      <div
                        style={{
                          transform: isActive ? 'scale(1)' : 'scale(0.88)',
                          opacity: isActive ? 1 : 0.45,
                          filter: isActive ? 'brightness(1)' : 'brightness(0.6)',
                          transition: 'transform 500ms ease-out, opacity 500ms ease-out, filter 500ms ease-out',
                        }}
                      >
                        <button
                          type="button"
                          className="w-full text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-nano-yellow/50 rounded-[24px]"
                          onClick={() => isActive && openLightbox(idx)}
                          aria-label={`View ${slide.title}`}
                          tabIndex={isActive ? 0 : -1}
                        >
                          {/* Card */}
                          <div
                            className={`relative rounded-[24px] overflow-hidden transition-shadow duration-500 ${
                              isActive
                                ? 'shadow-[0_20px_80px_-16px_rgba(59,130,246,0.2),0_16px_60px_-12px_rgba(250,204,21,0.1)] ring-1 ring-white/15'
                                : 'shadow-lg ring-1 ring-white/[0.06]'
                            }`}
                          >
                            {/* Image */}
                            <div className="aspect-[3/4] overflow-hidden bg-nano-surface1">
                              <img
                                src={slide.image}
                                alt={slide.alt}
                                loading="lazy"
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                              />
                            </div>

                            {/* Gradient overlay for text readability */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                            {/* Caption overlay */}
                            <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
                              <h3 className="text-[15px] md:text-[17px] font-display font-bold text-white leading-snug tracking-tight">
                                {slide.title}
                              </h3>
                              <p className="mt-1.5 text-[12px] md:text-[13px] text-slate-300/90 leading-relaxed line-clamp-2">
                                {slide.caption}
                              </p>
                              {/* Tags — only on active */}
                              {isActive && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {slide.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="px-2 py-0.5 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.12em] rounded-full bg-white/10 text-white/70 border border-white/10"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dot indicators */}
            <div className="flex justify-center gap-2 mt-8" role="tablist" aria-label="Slide indicators">
              {showcaseSlides.map((_, idx) => (
                <button
                  key={idx}
                  role="tab"
                  aria-selected={idx === selectedIndex}
                  aria-label={`Go to slide ${idx + 1}`}
                  onClick={() => emblaApi?.scrollTo(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === selectedIndex
                      ? 'w-8 bg-nano-yellow shadow-[0_0_10px_rgba(250,204,21,0.4)]'
                      : 'w-1.5 bg-white/20 hover:bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          PERFORMANCE PROOF SECTION
          ═══════════════════════════════════════════════════ */}
      <section
        id="performance"
        className="relative py-24 overflow-hidden"
        aria-label="Performance proof"
      >
        {/* Atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#030712] via-nano-surface1/40 to-[#030712] pointer-events-none" />
        <div className="absolute top-0 left-0 w-full section-divider-warm" />

        <div className="relative z-10 container mx-auto px-6 max-w-5xl" ref={perfRevealRef}>
          {/* Header */}
          <div className="text-center mb-14" data-reveal="up">
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="h-[1px] w-10 bg-gradient-to-r from-transparent to-nano-amber/40" />
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-nano-amber font-display">
                Observed Speed
              </span>
              <div className="h-[1px] w-10 bg-gradient-to-l from-transparent to-nano-amber/40" />
            </div>
            <h2 className="font-display text-2xl md:text-[36px] font-bold tracking-tight text-white leading-[1.15]">
              Fast Enough for Real Creative Iteration
            </h2>
            <p className="mt-5 text-[15px] md:text-[16px] leading-relaxed text-slate-300 max-w-2xl mx-auto">
              In observed BYOK testing with Nano Banana 2, Cast Director Studio produced
              high-quality character generations fast enough for real creative iteration —
              helping creators test looks, lighting, wardrobe, and character direction
              without waiting all day between results.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5" data-reveal="up">
            {PERF_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-[20px] p-6 md:p-7 flex flex-col items-center text-center bg-white/[0.02] border border-white/[0.06] hover:border-nano-yellow/20 transition-all duration-300 hover:-translate-y-1 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-nano-yellow/10 border border-nano-yellow/20 flex items-center justify-center mb-4 group-hover:shadow-[0_0_16px_rgba(250,204,21,0.15)] transition-shadow">
                    <Icon size={18} className="text-nano-yellow" />
                  </div>
                  <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2 font-display">
                    {card.label}
                  </span>
                  <span className="text-lg md:text-xl font-display font-bold text-white tracking-tight">
                    {card.stat}
                  </span>
                  {card.note && (
                    <span className="mt-1.5 text-[11px] text-slate-500 leading-snug">
                      {card.note}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Disclaimer */}
          <p
            className="mt-8 text-center text-[11px] md:text-[12px] text-slate-500 leading-relaxed max-w-3xl mx-auto"
            data-reveal="up"
          >
            Observed BYOK test results using Nano Banana 2. Generation times are not guaranteed
            and may vary by AI provider, model load, resolution, reference inputs, prompt
            complexity, network conditions, and selected workflow.
          </p>
        </div>
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ShowcaseLightbox
          slides={showcaseSlides}
          activeIndex={lightboxIndex}
          onClose={closeLightbox}
          onPrev={lightboxPrev}
          onNext={lightboxNext}
        />
      )}
    </>
  );
}
