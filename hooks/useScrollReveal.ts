import { useEffect, useRef } from 'react';

/**
 * useScrollReveal — lightweight IntersectionObserver hook for scroll-triggered reveal animations.
 * 
 * Elements animate in when entering the viewport and animate out (reverse) when leaving.
 * Content stays in the DOM at all times — only visual properties change.
 * Fully SEO/AI-search safe.
 */
export function useScrollReveal(options?: {
  staggerDelay?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initTimeout = setTimeout(() => {
      const elements = container.querySelectorAll('[data-reveal]');
      if (elements.length === 0) return;

      const staggerDelay = options?.staggerDelay ?? 120;

      // Batch reveals for stagger effect
      let revealQueue: HTMLElement[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        revealQueue.sort((a, b) => {
          const aRect = a.getBoundingClientRect();
          const bRect = b.getBoundingClientRect();
          return aRect.top - bRect.top || aRect.left - bRect.left;
        });
        revealQueue.forEach((el, i) => {
          el.style.transitionDelay = `${i * staggerDelay}ms`;
          el.classList.add('revealed');
        });
        revealQueue = [];
        flushTimer = null;
      };

      const observer = new IntersectionObserver(
        (entries) => {
          let hasNewReveal = false;

          for (const entry of entries) {
            const el = entry.target as HTMLElement;

            if (entry.isIntersecting) {
              // Element entering viewport — queue for staggered reveal
              if (!el.classList.contains('revealed')) {
                revealQueue.push(el);
                hasNewReveal = true;
              }
            } else {
              // Element leaving viewport — hide immediately (no stagger on exit)
              el.style.transitionDelay = '0ms';
              el.classList.remove('revealed');
            }
          }

          if (hasNewReveal && !flushTimer) {
            flushTimer = setTimeout(flush, 50);
          }
        },
        { 
          threshold: 0,
          rootMargin: '0px 0px 0px 0px'
        }
      );

      observerRef.current = observer;
      elements.forEach((el) => observer.observe(el));
    }, 100);

    return () => {
      clearTimeout(initTimeout);
      observerRef.current?.disconnect();
    };
  }, [options?.staggerDelay]);

  return containerRef;
}
