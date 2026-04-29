import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ShowcaseSlide } from '../data/showcaseSlides';

interface ShowcaseLightboxProps {
  slides: ShowcaseSlide[];
  activeIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const ShowcaseLightbox: React.FC<ShowcaseLightboxProps> = ({
  slides,
  activeIndex,
  onClose,
  onPrev,
  onNext,
}) => {
  const slide = slides[activeIndex];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    },
    [onClose, onPrev, onNext],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  if (!slide) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="lightbox-backdrop"
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/90 backdrop-blur-xl"
          onClick={onClose}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-50 w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Close lightbox"
        >
          <X size={20} />
        </button>

        {/* Prev arrow */}
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Previous slide"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Next arrow */}
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Next slide"
        >
          <ChevronRight size={24} />
        </button>

        {/* Content */}
        <motion.div
          key={slide.id}
          className="relative z-40 flex flex-col items-center max-w-5xl w-full mx-4 md:mx-8"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Image */}
          <div className="relative w-full rounded-[24px] overflow-hidden shadow-[0_32px_128px_-16px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
            <img
              src={slide.image}
              alt={slide.alt}
              className="w-full h-auto max-h-[70vh] object-contain bg-black/40"
            />
          </div>

          {/* Meta below image */}
          <div className="mt-6 text-center max-w-2xl px-4">
            <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight">
              {slide.title}
            </h3>
            <p className="mt-2 text-[15px] text-slate-400 leading-relaxed">
              {slide.caption}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {slide.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] rounded-full bg-nano-yellow/10 text-nano-yellow/80 border border-nano-yellow/20"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-4 text-[12px] text-slate-500">
              {activeIndex + 1} / {slides.length}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ShowcaseLightbox;
