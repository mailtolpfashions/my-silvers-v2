"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSwipe } from "@/lib/use-swipe";

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
  /**
   * A portrait crop for phones. Optional: blank means the desktop asset is used
   * at every width, so slides authored before this existed keep working.
   */
  mediaMobile?: string;
  overlayOpacity?: number;
};

const AUTOPLAY_MS = 5000;

/**
 * Backdrop for a slide with no artwork.
 *
 * The previous storefront put a per-slide gradient behind every hero, which is
 * why its carousel still looked deliberate before the photography arrived. Flat
 * graphite reads as a missing image; a gradient reads as a design.
 */
const EMPTY_BACKDROP =
  "linear-gradient(135deg, var(--graphite-950) 0%, var(--graphite-800) 45%, var(--brass-text) 100%)";

/** Cloudinary serves video from /video/upload/; also match bare file extensions. */
function isVideo(url: string) {
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url) || url.includes("/video/upload/");
}

/**
 * The homepage hero.
 *
 * Laid out as an inset rounded card rather than a full-bleed band, carrying over
 * the previous storefront's design: padding around the whole thing, aspect
 * ratios instead of a fixed height, copy bottom-left over a bottom-up scrim, and
 * the dots below the card rather than floating on it.
 *
 * Aspect ratio, not height, is the important part. A fixed height has to guess
 * what a phone can spare; 4/5 on mobile through 21/8 on desktop lets the shape
 * change with the viewport, which is what stops it eating a whole small screen.
 *
 * Slides still crossfade rather than sliding on a track — the old build used
 * Swiper for that, and a carousel library is a lot of JavaScript to buy one
 * transition. Everything else about the design is the same.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  /**
   * The first slide must not animate in — it's above the fold on load, and
   * sliding the headline up on arrival reads as jank rather than polish.
   *
   * This is state, not a ref. It was a ref read during render, which React
   * forbids: a ref mutation doesn't schedule a re-render, so the value the
   * renderer sees is whatever happened to be there. Anything that decides what
   * gets rendered has to be state.
   */
  const [hasAdvanced, setHasAdvanced] = useState(false);

  const goTo = useCallback((i: number) => {
    setActiveIndex(i);
    setHasAdvanced(true);
  }, []);
  const goNext = useCallback(() => {
    setActiveIndex((i) => (i + 1) % slides.length);
    setHasAdvanced(true);
  }, [slides.length]);
  const goPrev = useCallback(() => {
    setActiveIndex((i) => (i - 1 + slides.length) % slides.length);
    setHasAdvanced(true);
  }, [slides.length]);

  // Applied to the copy block on every slide except the one painted on load.
  const entrance = hasAdvanced ? "animate-in fade-in slide-in-from-bottom-3" : "";

  // Swipe replaces the arrows on touch. The arrows sit at the vertical centre,
  // which on a phone is directly on top of the headline.
  const swipe = useSwipe({
    onPrev: slides.length > 1 ? goPrev : undefined,
    onNext: slides.length > 1 ? goNext : undefined,
  });

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
  const overlay = (slide.overlayOpacity ?? 55) / 100;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured collections"
      // No padding: the hero is the first thing on the page and it runs to the
      // edges of the viewport, directly under the header.
      className="relative"
    >
      <div
        {...swipe.handlers}
        // A swipe that happens to end over the CTA must not follow it. Capture
        // phase, so this runs before the Link sees the click.
        onClickCapture={swipe.cancelClickAfterSwipe}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        // Shape by aspect ratio, so the card reflows instead of being told how
        // tall to be: portrait on a phone, cinematic on a desktop.
        // Ratios measured off the reference: 0.49 on a phone (a hero that very
        // nearly fills the screen) and 2.79 on desktop. Square corners and no
        // inset — theirs runs edge to edge, and the rounded inset card was the
        // previous target's idea, not this one.
        className="relative aspect-[1/2] w-full touch-pan-y overflow-hidden sm:aspect-[2/1] lg:aspect-[2.79/1]"
        style={{ background: EMPTY_BACKDROP }}
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
                /**
                 * <picture> so a phone can be sent a differently CROPPED image,
                 * not merely a smaller one. `sizes` only ever changes resolution;
                 * a 21:8 landscape scaled down still puts the subject in a
                 * letterbox on a 4:5 portrait card.
                 *
                 * The <source> wins below 768px and the browser fetches only
                 * that file — the spec guarantees one request, so this costs
                 * nothing when unused.
                 *
                 * The trade-off: a matched <source> bypasses Next's optimizer,
                 * so the mobile asset is served as uploaded. Acceptable, because
                 * a hand-cropped mobile hero is already authored at the right
                 * size — and it is exactly the case where automatic resizing is
                 * wrong.
                 */
                <picture>
                  {s.mediaMobile && (
                    <source media="(max-width: 767px)" srcSet={s.mediaMobile} />
                  )}
                  <Image
                    src={s.media}
                    alt=""
                    fill
                    className="object-cover object-center"
                    preload={i === 0}
                    sizes="100vw"
                  />
                </picture>
              ))}
          </div>
        ))}

        {/* Bottom-up scrim, not left-to-right: the copy sits along the bottom
            edge, so that is the only part that needs darkening. Leaving the top
            clear keeps the photograph readable as a photograph. */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to top, rgba(12,12,14,${overlay}) 0%, rgba(12,12,14,0.10) 45%, transparent 100%)`,
          }}
        />

        {/* items-end: copy anchored to the bottom-left of the card. */}
        <div className="absolute inset-0 flex items-end">
          {/* Remounting on slide change replays the entrance animation. */}
          <div key={activeIndex} className="max-w-lg p-6 text-white sm:p-10">
            {slide.eyebrow && (
              <p
                className={`label-eyebrow label-eyebrow-light mb-3 ${entrance}`}
                style={{ animationDuration: "450ms" }}
              >
                {slide.eyebrow}
              </p>
            )}

            {/* text-white spelled out, even though the wrapper above already
                sets it: the base layer gives every h1 a graphite colour
                DIRECTLY, and a direct rule beats an inherited one whatever the
                layer order — so the headline came out near-black on the scrim.
                Same reason category/[slug] states it on its h1. */}
            <h1
              className={`mb-2 font-heading text-2xl leading-tight text-white sm:text-4xl lg:text-5xl ${entrance}`}
              style={{
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
                className={`mb-4 text-sm text-white/80 sm:text-base ${entrance}`}
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
                className={`flex flex-wrap items-center gap-5 ${entrance}`}
                style={{
                  animationDuration: "450ms",
                  animationDelay: "220ms",
                  animationFillMode: "backwards",
                }}
              >
                {slide.ctaLabel && slide.ctaHref && (
                  // A square white block with letter-spaced caps — the same
                  // shape as the `cta` button variant, inverted for a dark
                  // photograph. Not the shared <Button>: this one is
                  // deliberately smaller and wider-tracked than any button in
                  // the system, and forcing it through the variants would mean
                  // overriding nearly every one of them.
                  <Link
                    href={slide.ctaHref}
                    className="inline-block bg-white px-10 py-4 text-[13px] uppercase tracking-[0.08em] text-graphite-950 transition-colors hover:bg-ivory-200"
                  >
                    {slide.ctaLabel}
                  </Link>
                )}
                {slide.secondaryLabel && slide.secondaryHref && (
                  <Link
                    href={slide.secondaryHref}
                    className="text-sm font-medium text-white/80 underline underline-offset-4 transition-colors hover:text-white sm:text-base"
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
            {/* White on shadow rather than translucent glass: it has to read
                against artwork we do not control, and a light photo makes a
                white/20 button vanish. Desktop only — on a phone they land on
                the headline, and swipe covers it. */}
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous slide"
              className="absolute left-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-graphite-950 shadow-md transition-transform hover:scale-105 md:flex"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next slide"
              className="absolute right-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-graphite-950 shadow-md transition-transform hover:scale-105 md:flex"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Below the card, not floating on it — the previous storefront's
          arrangement, and it keeps the dots off the artwork. */}
      {slides.length > 1 && (
        <div className="mt-4 flex justify-center">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === activeIndex}
              // 28×40px hit area around an 8px dot: over the 24px WCAG 2.5.8
              // floor without spreading the dots so far apart they stop reading
              // as one control.
              className="flex h-10 w-7 items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-300 ${
                  i === activeIndex ? "w-6 bg-brass" : "w-2 bg-graphite-950/25"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
