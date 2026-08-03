"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type HeroSlide = {
  id: string;
  eyebrow?: string;
  headline: string;
  subline?: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  media?: string;
  overlayOpacity?: number;
};

const AUTOPLAY_MS = 5000;

/** Cloudinary serves video from /video/upload/; also match bare file extensions. */
function isVideo(url: string) {
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url) || url.includes("/video/upload/");
}

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // The first slide must not animate in — it's above the fold on load.
  const isFirstMount = useRef(true);
  useEffect(() => {
    isFirstMount.current = false;
  }, []);

  const goTo = useCallback((i: number) => setActiveIndex(i), []);
  const goNext = useCallback(
    () => setActiveIndex((i) => (i + 1) % slides.length),
    [slides.length]
  );
  const goPrev = useCallback(
    () => setActiveIndex((i) => (i - 1 + slides.length) % slides.length),
    [slides.length]
  );

  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;
    // Honour the OS "reduce motion" setting — auto-advancing carousels are a
    // known trigger, and WCAG 2.2.2 requires a way to stop moving content.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = setInterval(goNext, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [goNext, slides.length, isPaused]);

  if (slides.length === 0) return null;
  const slide = slides[Math.min(activeIndex, slides.length - 1)];
  const overlay = (slide.overlayOpacity ?? 60) / 100;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured collections"
      className="relative w-full overflow-hidden bg-ink"
      style={{ height: "clamp(420px, 64vh, 660px)" }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      {/* All slides stay mounted and crossfade on opacity — no layout thrash,
          and the next image is already decoded when it becomes visible. */}
      {slides.map((s, i) => (
        <div
          key={s.id}
          aria-hidden={i !== activeIndex}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            i === activeIndex ? "opacity-100" : "opacity-0"
          }`}
        >
          {s.media &&
            (isVideo(s.media) ? (
              <video
                src={s.media}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            ) : (
              <Image
                src={s.media}
                alt=""
                fill
                className="object-cover object-center"
                priority={i === 0}
                sizes="100vw"
              />
            ))}
        </div>
      ))}

      {/* Readability scrim — strongest on the left, where the copy sits. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to right, rgba(12,12,14,${overlay}) 38%, rgba(12,12,14,0.15) 100%)`,
        }}
      />

      {/* Subtle dot texture, same trick as the reference site. */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 mx-auto flex h-full max-w-[1600px] items-center px-4 sm:px-6 lg:px-8">
        {/* Remounting on slide change replays the entrance animation. */}
        <div key={activeIndex} className="max-w-[540px] py-10">
          {slide.eyebrow && (
            <p
              className={`mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-gold-light ${
                isFirstMount.current ? "" : "animate-in fade-in slide-in-from-bottom-3"
              }`}
              style={{ animationDuration: "450ms" }}
            >
              {slide.eyebrow}
            </p>
          )}

          <h1
            className={`font-heading text-white ${
              isFirstMount.current ? "" : "animate-in fade-in slide-in-from-bottom-3"
            }`}
            style={{
              fontSize: "clamp(2rem, 4.5vw, 3.25rem)",
              lineHeight: 1.1,
              animationDuration: "450ms",
              animationDelay: "70ms",
              animationFillMode: "backwards",
            }}
          >
            {slide.headline.split("\n").map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </h1>

          {slide.subline && (
            <p
              className={`mt-4 max-w-[420px] text-sm leading-relaxed text-white/80 md:text-base ${
                isFirstMount.current ? "" : "animate-in fade-in slide-in-from-bottom-3"
              }`}
              style={{
                animationDuration: "450ms",
                animationDelay: "150ms",
                animationFillMode: "backwards",
              }}
            >
              {slide.subline}
            </p>
          )}

          {(slide.ctaLabel || slide.secondaryLabel) && (
            <div
              className={`mt-8 flex flex-wrap items-center gap-5 ${
                isFirstMount.current ? "" : "animate-in fade-in slide-in-from-bottom-3"
              }`}
              style={{
                animationDuration: "450ms",
                animationDelay: "220ms",
                animationFillMode: "backwards",
              }}
            >
              {slide.ctaLabel && slide.ctaHref && (
                <Button asChild size="lg" className="bg-gold text-ink hover:bg-gold-light">
                  <Link href={slide.ctaHref}>{slide.ctaLabel}</Link>
                </Button>
              )}
              {slide.secondaryLabel && slide.secondaryHref && (
                <Link
                  href={slide.secondaryHref}
                  className="text-sm font-medium text-white/80 underline underline-offset-4 transition-colors hover:text-white"
                >
                  {slide.secondaryLabel}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous slide"
            className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next slide"
            className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* 40px touch targets; the inner span is the visible dot. */}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === activeIndex}
                className="flex h-10 w-10 items-center justify-center"
              >
                <span
                  style={{ transform: i === activeIndex ? "scaleX(4)" : "scaleX(1)" }}
                  className={`block h-2 w-2 origin-left rounded-full transition-transform duration-300 ${
                    i === activeIndex ? "bg-gold" : "bg-white/40"
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
