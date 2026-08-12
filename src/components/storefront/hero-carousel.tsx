"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useSwipe } from "@/lib/use-swipe";
import { usePointerPause } from "@/lib/use-pointer-pause";

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
   * A portrait crop, used below 1024px. Optional: blank means the desktop asset
   * is used at every width, so slides authored before this existed keep working.
   */
  mediaMobile?: string;
  overlayOpacity?: number;
  /**
   * Which way the FLOATING HEADER's text runs while this slide is showing.
   *
   * "light" (white type) is the default and suits photography. "dark" exists for
   * pale artwork: the header over a hero is transparent, and its only defence is
   * a scrim that fades to nothing by the header's bottom edge — so on a white
   * slide the wordmark, nav and cart all sit at roughly 1:1 contrast and vanish.
   * Deepening the scrim is not the fix; it just paints a grey bar across the top
   * of a white photograph.
   *
   * Per SLIDE rather than per hero, because a carousel can mix a white packshot
   * with a dark editorial frame — the attribute follows the active index.
   */
  headerTone?: "light" | "dark";
};

/**
 * Backdrop for a slide with no artwork.
 *
 * A flat fill reads as a missing image; a gradient reads as a design. Three
 * distinct stops — the old third stop was the brass accent, and monochroming it
 * made stops 1 and 3 the same colour, which turned this back into the flat fill
 * it exists to avoid. `--grey` is the light end now.
 */
const EMPTY_BACKDROP =
  "linear-gradient(135deg, var(--black) 0%, var(--half-black) 45%, var(--grey) 100%)";

/** Cloudinary serves video from /video/upload/; also match bare file extensions. */
function isVideo(url: string) {
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url) || url.includes("/video/upload/");
}

/**
 * How long a slide holds before the next one takes its place.
 *
 * ⚠️  Four seconds is still faster than a headline and a subline can be read
 * unhurriedly. It has come down from six — the reference's value, chosen on
 * exactly that reasoning — via three, which read as too fast. If the hero ever
 * starts feeling like flicker again, this is the number to raise, not the
 * transition.
 */
const AUTOPLAY_MS = 4000;

/** How long a pointer interaction holds the rotation before it resumes. */
const POINTER_PAUSE_MS = 2000;

/**
 * The homepage hero.
 *
 * ── What changed, and why ────────────────────────────────────────────────────
 * Rebuilt against the reference's own hero behaviour rather than its markup.
 * Four things that composition does, which this now does too:
 *
 * 1. SLIDES, rather than crossfades. A track of full-width panels translated on
 *    the x-axis. Movement tells you there is more; an opacity dissolve reads as
 *    the page repainting itself.
 * 2. THE WHOLE PANEL IS THE LINK. Not just the CTA — a shopper who taps a
 *    photograph expects to go where it points. Implemented as a stretched
 *    ::before on the real CTA link rather than by wrapping everything in an
 *    <a>, so the secondary link stays a separately focusable element instead of
 *    being swallowed by an outer anchor (which is also invalid HTML).
 * 3. ART-DIRECTED CROPS AT 1024, not 768. A portrait asset serves phones AND
 *    tablets; the cinematic landscape one starts at desktop. The container's
 *    own aspect ratio switches at exactly the same breakpoint — serving a 9:16
 *    portrait into a 2.79:1 letterbox is the failure this pairing avoids.
 * 4. IT ROTATES, AND IT WRAPS. See below.
 *
 * ── Autoplay, and the four things that make it legitimate ────────────────────
 * This hero used to sit still on purpose, on the grounds that auto-advancing
 * content is the biggest accessibility liability a hero can carry. That grounds
 * was right about the RISK and wrong to conclude "never" — WCAG 2.2.2 does not
 * ban movement, it requires a way to stop it. So the rotation is back, with the
 * mechanism the old version lacked:
 *
 * 1. A VISIBLE PAUSE CONTROL, at every width. This is the part that actually
 *    satisfies 2.2.2, and the part most carousels get wrong. Pausing on hover
 *    is NOT a mechanism: it is undiscoverable, it does not exist for a keyboard
 *    user, and it cannot be reached at all on a touchscreen.
 * 2. prefers-reduced-motion IS HONOURED, and honoured properly — the timer
 *    never starts, rather than the transition merely being shortened. The
 *    media query is watched live, so changing the OS setting takes effect
 *    without a reload.
 * 3. IT PAUSES WHEN ANYONE IS LOOKING CLOSELY — pointer over the hero, focus
 *    anywhere inside it, or the tab in the background. Not a substitute for
 *    (1), but it stops the hero moving out from under a shopper who is reading
 *    it or tabbing through its links.
 * 4. THE TIMER RESTARTS ON EVERY MANUAL MOVE, so a slide the shopper just chose
 *    gets its full six seconds instead of the remainder of the previous one.
 *
 * WRAPPING is a consequence of the above, not an independent decision. The
 * arrows used to clamp — `previous` disabled on the first slide — on the
 * grounds that the hero is a short sequence with a beginning and an end. A
 * sequence that rotates on a timer is a loop by definition, and a disabled
 * "next" arrow on a carousel that is visibly still advancing is a contradiction
 * the shopper has to resolve. So the whole thing loops now, arrows included.
 *
 * No carousel library. The track is a CSS transform, the gesture is the
 * project's own useSwipe, and the timer below is a setTimeout; embla or similar
 * would be ~20KB for one translate.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  /**
   * The shopper's explicit choice, via the pause button. Separate from the
   * three incidental reasons to hold below — pressing pause has to survive the
   * pointer leaving the hero, or the button does nothing that lasts.
   */
  const [playing, setPlaying] = useState(true);

  /**
   * Focus somewhere inside the hero. Holds for as long as it lasts.
   *
   * Split from the pointer, which now only pauses briefly — see
   * usePointerPause. A keyboard user working through a slide's links cannot be
   * asked to read against a two-second timer, and the explicit pause button
   * below is the WCAG 2.2.2 mechanism for everyone else.
   */
  const [focusHeld, setFocusHeld] = useState(false);

  /** Pointer interaction: pauses for two seconds, then resumes on its own. */
  const { paused: pointerPaused, nudge } = usePointerPause(POINTER_PAUSE_MS);

  /** Tab in the background. No reason to advance a hero nobody is looking at. */
  const [documentHidden, setDocumentHidden] = useState(false);

  /**
   * Starts false so the server render and the first client render agree, and
   * so nothing moves before hydration either way. The effect below settles it.
   */
  const [motionAllowed, setMotionAllowed] = useState(false);

  const count = slides.length;

  // Wrapped, not clamped — see the note above.
  const goTo = useCallback(
    (i: number) => setActiveIndex(((i % count) + count) % count),
    [count]
  );
  const goPrev = useCallback(() => setActiveIndex((i) => (i - 1 + count) % count), [count]);
  const goNext = useCallback(() => setActiveIndex((i) => (i + 1) % count), [count]);

  const swipe = useSwipe({
    onPrev: count > 1 ? goPrev : undefined,
    onNext: count > 1 ? goNext : undefined,
  });

  // Watched rather than read once: someone toggling "reduce motion" in the OS
  // expects the page to obey immediately, not at the next navigation.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotionAllowed(!query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setDocumentHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const autoplaying =
    count > 1 && motionAllowed && playing && !focusHeld && !pointerPaused && !documentHidden;

  /**
   * setTimeout, not setInterval, and `activeIndex` is deliberately a dependency:
   * every slide change tears this down and starts a fresh six seconds. That is
   * what gives a manually chosen slide its full hold — with an interval, a
   * shopper who clicks `next` at second 5.8 sees the hero move again almost
   * immediately, which reads as the carousel fighting them.
   */
  useEffect(() => {
    if (!autoplaying) return;
    const timer = setTimeout(() => setActiveIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [autoplaying, activeIndex, count]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      // The marker the header keys off. It says one thing — "this page opens
      // with artwork that owns the top of the viewport" — and the storefront
      // shell's `:has()` rule in globals.css turns that into a header floating
      // over the hero instead of sitting above it. Anything else that ever
      // wants the same treatment (a full-bleed collection hero, say) opts in by
      // carrying this attribute; nothing has to know about the header.
      data-hero-full
      // Set ONLY on a slide that asks for dark header type, so the default path
      // emits exactly the markup it always did and the CSS needs no rule for it.
      // It tracks the active index: with a mixed carousel the header flips as
      // the pale slide comes round. See `headerTone` on HeroSlide.
      data-header-ink={slides[activeIndex]?.headerTone === "dark" ? "dark" : undefined}
      // z-10 is what makes the pinned reveal work: the category band that
      // follows is pulled up BEHIND this hero (see PinnedRevealStage in
      // homepage-section.tsx) and, being a later sibling, would otherwise paint
      // on top of it. Well under the header's z-40, which still floats above.
      //
      // `hero-curtain` is the opposite arrangement, and it applies only below
      // 1024px, where that pinned chain cannot run at all: this hero sticks to
      // the top of the viewport and the sections after it scroll over and cover
      // it. The class carries both halves — the stick and the siblings' cover —
      // so the two can never be half-applied. It overrides the `relative z-10`
      // above inside its own media query; both are left here because each is
      // what the OTHER breakpoint needs. See the .hero-curtain block in
      // globals.css before changing either.
      className="hero-curtain relative z-10"
      // Pointer and focus are handled differently on purpose — see the two
      // pieces of state above. `onMouseMove` as well as `onMouseEnter` so that
      // moving around inside the hero keeps deferring the resume rather than
      // letting it fire while the shopper is still reading.
      //
      // React's onFocus/onBlur bubble, so those two behave as focus-within and
      // cover a keyboard user tabbing into a slide's links.
      onMouseEnter={nudge}
      onMouseMove={nudge}
      onFocus={() => setFocusHeld(true)}
      onBlur={() => setFocusHeld(false)}
    >
      <div
        {...swipe.handlers}
        // A swipe that happens to end over a link must not follow it. Capture
        // phase, so this runs before the Link sees the click.
        onClickCapture={swipe.cancelClickAfterSwipe}
        // The full window, at every width.
        //
        // This replaces the 9/16 → 4/5 → 2.79:1 aspect ladder. Height now comes
        // from the viewport rather than from the frame's own proportions, which
        // is why the art-directed <picture> below matters MORE than it did, not
        // less: a 2.79:1 landscape asset dropped into a 390×740 portrait window
        // gets centre-cropped to a sliver of itself. The 1024px <source>
        // breakpoint is what keeps a portrait crop on portrait windows.
        //
        // `svh`, not `vh` or `dvh`. `vh` is the LARGE viewport on mobile, so the
        // bottom of the hero — where all the copy and the CTA live — starts life
        // hidden behind the browser's own URL bar. `dvh` fixes that but makes
        // the hero resize as the bar retracts, which reflows the copy mid-scroll.
        // `svh` is the smallest viewport: everything is visible on load and
        // nothing moves afterwards.
        className="relative h-svh w-full touch-pan-y overflow-hidden"
        style={{ background: EMPTY_BACKDROP }}
      >
        {/* The track. One row of full-width panels, translated by whole
            viewports. transform (not `left`) so it composites on the GPU. */}
        <div
          // The ARIA carousel pattern: "off" while the timer is running, so a
          // screen reader is not interrupted every six seconds by a change the
          // user did not ask for — and "polite" once it is paused or under
          // manual control, when a slide change IS the result of their action
          // and should be announced.
          aria-live={autoplaying ? "off" : "polite"}
          className="flex h-full w-full transition-transform duration-700 ease-out motion-reduce:transition-none"
          style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
        >
          {slides.map((slide, i) => {
            const overlay = (slide.overlayOpacity ?? 55) / 100;
            const isActive = i === activeIndex;

            return (
              <div
                key={slide.id}
                // Off-screen panels are hidden from assistive tech and taken out
                // of the tab order — otherwise Tab walks into links a sighted
                // user cannot see, and the browser scrolls the track sideways to
                // chase the focus ring.
                aria-hidden={!isActive}
                inert={!isActive}
                className="relative h-full w-full shrink-0"
              >
                {slide.media &&
                  (isVideo(slide.media) ? (
                    <video
                      src={slide.media}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 h-full w-full object-cover object-center"
                    />
                  ) : (
                    /**
                     * <picture> so a phone is sent a differently CROPPED image,
                     * not merely a smaller one. `sizes` only ever changes
                     * resolution; a 2.79:1 landscape scaled down still puts the
                     * subject in a letterbox on a portrait frame.
                     *
                     * `display: contents` so <picture> creates no layout box —
                     * otherwise it becomes the positioned ancestor of an
                     * <Image fill> and it is `static`.
                     *
                     * The trade-off: a matched <source> bypasses Next's
                     * optimizer, so the portrait asset is served as uploaded.
                     * Acceptable, because a hand-cropped hero is already
                     * authored at the right size — and it is exactly the case
                     * where automatic resizing is wrong.
                     */
                    <picture className="contents">
                      {slide.mediaMobile && (
                        <source media="(max-width: 1023px)" srcSet={slide.mediaMobile} />
                      )}
                      <Image
                        src={slide.media}
                        alt=""
                        fill
                        className="object-cover object-center"
                        // Only the first panel is above the fold. The rest are
                        // off-screen until asked for.
                        preload={i === 0}
                        loading={i === 0 ? undefined : "lazy"}
                        sizes="100vw"
                      />
                    </picture>
                  ))}

                {/* Bottom-up scrim: the copy sits along the bottom edge, so
                    that is the only part that needs darkening. Leaving the top
                    clear keeps the photograph readable as a photograph. */}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(to top, rgba(12,12,14,${overlay}) 0%, rgba(12,12,14,0.10) 45%, transparent 100%)`,
                  }}
                />

                {/* Copy, bottom-left. Padded on the right so a long headline
                    never runs under the arrow cluster — and, below lg, padded
                    at the bottom to clear the dots, which now sit ON the
                    artwork rather than under the frame. Only when there ARE
                    dots: a single-slide hero would otherwise carry 80px of
                    empty scrim under its CTA for no reason. */}
                <div className="absolute inset-0 flex items-end">
                  <div
                    className={`max-w-lg p-6 text-white sm:p-10 lg:pb-14 lg:pr-32 ${
                      count > 1 ? "pb-20 sm:pb-20" : "pb-10 sm:pb-10"
                    }`}
                  >
                    {/* White, not the black modifier used elsewhere. The
                        eyebrow sits above the headline where the bottom-up
                        scrim is already thinning out, so it has to read against
                        an arbitrary uploaded photograph — and --white on
                        a pale or warm image is invisible. The scrim guarantees
                        white; it guarantees nothing about the accent. */}
                    {slide.eyebrow && (
                      <p className="label-eyebrow mb-3 !text-white/85">{slide.eyebrow}</p>
                    )}

                    {/* text-white spelled out: the base layer colours every
                        heading directly, and a direct rule beats an inherited
                        one whatever the layer order — so the headline came out
                        near-black on the scrim. */}
                    <h1 className="text-display font-heading text-white">
                      {slide.headline.split("\n").map((line, li) => (
                        <span key={li} className="block">
                          {line}
                        </span>
                      ))}
                    </h1>

                    {slide.subline && (
                      <p className="mt-3 max-w-md text-sm text-white/80">{slide.subline}</p>
                    )}

                    {(slide.ctaLabel || slide.secondaryLabel) && (
                      <div className="mt-6 flex flex-wrap items-center gap-6">
                        {/* The primary CTA carries a stretched ::before, which
                            is what makes the WHOLE panel clickable while
                            keeping this a real, focusable link. z-0 so the
                            secondary link below can sit above it. */}
                        {slide.ctaLabel && slide.ctaHref && (
                          <Link
                            href={slide.ctaHref}
                            className="group/hero relative inline-flex items-center gap-2 border-b border-white/70 pb-1 text-sm font-medium text-white transition-colors before:absolute before:inset-0 before:z-0 before:content-[''] hover:border-white lg:before:-inset-x-10 lg:before:-inset-y-14"
                          >
                            {slide.ctaLabel}
                            <ArrowRight
                              aria-hidden
                              className="size-4 transition-transform duration-300 group-hover/hero:translate-x-1"
                            />
                          </Link>
                        )}
                        {slide.secondaryLabel && slide.secondaryHref && (
                          <Link
                            href={slide.secondaryHref}
                            className="relative z-10 text-sm text-white/75 transition-colors hover:text-white"
                          >
                            {slide.secondaryLabel}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Arrows, as a corner cluster. Desktop only: on a phone they would sit
            on top of the copy, and swipe covers it there. They wrap now, so
            neither is ever disabled — see the note on the component.

            The pause toggle leads the cluster. It is rendered only once the
            reduced-motion query has been read, because a pause button on a hero
            that is never going to move is a control that lies. The cluster is
            anchored by its RIGHT edge, so the toggle appearing after hydration
            grows it leftwards and the arrows do not shift. */}
        {count > 1 && (
          <div className="absolute bottom-8 right-8 z-10 hidden items-center lg:flex">
            {motionAllowed && (
              <HeroControl
                label={playing ? "Pause slideshow" : "Play slideshow"}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </HeroControl>
            )}
            <HeroControl label="Previous slide" onClick={goPrev}>
              <ChevronLeft className="size-4" />
            </HeroControl>
            <HeroControl label="Next slide" onClick={goNext}>
              <ChevronRight className="size-4" />
            </HeroControl>
          </div>
        )}

        {/* Dots, phone and tablet only — where swipe is the interaction and the
            shopper needs a sense of position.

            These used to sit BELOW the frame, deliberately kept off the artwork.
            A full-window hero leaves nowhere below the frame to sit: anything
            after it is, by definition, off the screen. So they move onto the
            scrim, at the bottom edge where it is darkest and the copy above has
            been padded to make room. The inactive dash goes white-on-scrim
            rather than graphite, which was only ever legible against the ivory
            page it no longer sits on. */}
        {count > 1 && (
          <div className="absolute inset-x-0 bottom-6 z-10 flex items-center justify-center lg:hidden">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === activeIndex}
                // 28×40px hit area around a 6px dash: over the 24px WCAG 2.5.8
                // floor without spreading them so far apart they stop reading as
                // one control.
                className="flex h-10 w-7 items-center justify-center"
              >
                <span
                  className={`block h-1.5 transition-all duration-300 ${
                    // White, not the ink accent every other active dot uses:
                    // these sit ON photography, where black would disappear
                    // into a dark scrim. The inactive dash is already white at
                    // 45%, so the pair reads as one control.
                    i === activeIndex ? "w-6 bg-white" : "w-1.5 bg-white/45"
                  }`}
                />
              </button>
            ))}

            {/* The pause control on phone and tablet — the width where WCAG
                2.2.2 is most often failed, because hover-to-pause does not
                exist on a touchscreen and dots alone give no way to stop the
                movement.

                Absolutely positioned rather than another flex child so the dots
                stay centred on the frame. A plain white glyph, not the solid
                fill the desktop arrows use: it sits at the bottom edge where
                the slide's own scrim is at its strongest, so it has contrast
                without putting a second white block on the artwork. */}
            {motionAllowed && (
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "Pause slideshow" : "Play slideshow"}
                className="absolute right-2 flex size-10 items-center justify-center text-white/80 transition-colors hover:text-white"
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * A square 48px HOLLOW control — the desktop cluster's pause, previous and next
 * all share it. No radius and no shadow, like everything else on this
 * storefront.
 *
 * ── It used to be solid, and that was not an accident ────────────────────────
 * The note here previously read: "Solid, not translucent: these sit over
 * photography nobody controls, and a white/20 button vanishes on a pale image."
 * That risk is real and has not gone away — an outline over a bright, busy
 * photograph is the weakest state this control can be in.
 *
 * Two things carry it instead of a fill:
 *   backdrop-blur   softens whatever is behind the glyph, so the edge stays
 *                   readable over detail rather than only over flat colour
 *   white/70 border at 1px against a white glyph, which is the same pairing the
 *                   hero's own copy already relies on over these images
 *
 * If a slide ever defeats it, the fix is a darker scrim on that slide — not a
 * return to a white block, which is what this was asked to stop being.
 *
 * The `disabled` state this used to carry is gone with the clamping: the track
 * wraps, so there is no end to be stranded at and nothing to grey out.
 */
function HeroControl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-12 items-center justify-center border border-white/70 text-white backdrop-blur-sm transition-colors hover:border-white hover:bg-white/15"
    >
      {children}
    </button>
  );
}
