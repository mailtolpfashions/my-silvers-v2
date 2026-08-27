"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Quote, Star } from "lucide-react";

export type CarouselReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  authorName: string;
  /** The reviewer's own photo when they attached one, else the catalogue shot. */
  image: string | null;
  /** True when `image` is the customer's own picture — drives the plate caption. */
  isCustomerPhoto: boolean;
  product: { name: string; slug: string };
};

/* ── The dials ────────────────────────────────────────────────────────────────
   Every number the fan depends on, in one place, because they are not
   independent: raising SAG without raising the stage height crops the outer
   plates, and raising BERTH pushes them outside the container.

   ── These are MEASURED, not invented ────────────────────────────────────────
   Read off the reference component running at a 1920 viewport by decomposing
   each plate's matrix3d, so they are the reference's own numbers rather than a
   guess at them. Its centre plate is 290×370 with the neighbours at:

     step 1   translate(±260.7, 33.1, -61.9)   scale 0.830   rotate ∓4.0°
     step 2   translate(±503.9, 81.0, -123.9)  scale 0.689   rotate ∓8.0°

   from which BERTH = 260.7/290, CROWD = log2(503.9/260.7), TAPER = 0.830 (and
   0.830² = 0.689, confirming it compounds per step), and CANT and RECEDE are
   plainly linear per step. SAG and BOW come from the Y column with the idle
   sway (±4px, which is why the two step-1 plates read 33.1 and 37.0) removed.

   An earlier pass here had BERTH at 0.62, which is 30% tight: the neighbours
   sat half-hidden behind the centre plate and the fan read as a stack rather
   than an arc.
   ────────────────────────────────────────────────────────────────────────── */

/** Plates visible on EACH side of the centre. Beyond this they stop moving and
    stack, which is what lets a long ring look infinite without drawing six
    plates' worth of blur. Narrowed to 1 on a phone — see the measure effect. */
const WINDOW = 2;
/** Horizontal step as a fraction of plate width. Under 1 the plates overlap,
    which is the whole effect — at 1 they are a filmstrip. */
const BERTH = 0.9;
/** Exponent on the step. Below 1 the outer plates tighten toward the edge
    rather than marching away at a constant pitch. */
const CROWD = 0.95;
/** How far the outer plates fall, in px at one step out. This is the crescent. */
const SAG = 35;
/** Exponent on the fall — above 1 the first neighbour barely drops and the
    outer ones plunge, which reads as an arc rather than a staircase. */
const BOW = 1.24;
/** Scale multiplier per step away from centre. Compounds: step 2 is TAPER². */
const TAPER = 0.83;
/** Degrees of tilt per step, fanning away from the centre. Linear. */
const CANT = 4;
/** Z travel, in px, PER STEP. Linear, and it needs the stage's perspective. */
const RECEDE = 62;
/** Opacity removed at the outermost ring. */
const VEIL = 0.5;
/** Blur, in px, at the outermost ring. */
const HAZE = 1.4;

/** Spring stiffness. Higher arrives sooner. */
const TENSION = 42;
/** Spring damping. Lower overshoots; 11 against 42 is ~0.85 of critical, so it
    settles with one small kiss past the mark rather than a wobble. */
const FRICTION = 11;

/** Seconds a plate holds centre before autoplay advances. */
const DWELL = 5;
/** Seconds autoplay stays out of the way after someone touches the carousel. */
const RESUME_AFTER = 3;
/** Amplitude, in px, of the idle breath. Deliberately below the threshold of
    conscious notice — it stops the stage looking like a screenshot. */
const SWAY = 4;
/** Seconds per sway cycle. */
const SWAY_PERIOD = 7;
/** Lift, in px, of the centre plate under the cursor. */
const HOVER_LIFT = 6;

/** Pointer travel, in px, past which a drag is a drag and not a click. */
const DRAG_SLOP = 6;
/** Multiplier turning release velocity (indices/sec) into indices of throw. */
const FLICK = 0.28;
/** Trackpad travel, in px, that counts as one horizontal swipe. */
const WHEEL_THRESHOLD = 24;
/** Milliseconds the wheel is ignored after it fires. A trackpad reports a
    single flick as dozens of small events; without this, one gesture spins the
    whole ring. Measured: a short flick advances once and a long one twice,
    which is the proportional response you want — it is a rate limit, not a
    one-shot lock. */
const WHEEL_LOCKOUT = 340;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** JS `%` keeps the sign of the dividend; ring positions must not go negative. */
const wrap = (n: number, count: number) => ((n % count) + count) % count;

/**
 * The homepage testimonial carousel.
 *
 * ── What it is ──────────────────────────────────────────────────────────────
 * A coverflow: the centred review's photograph sits large and sharp, its
 * neighbours fan out to either side — smaller, tilted, dropped along an arc and
 * pushed back in Z, with only the outermost ring dimmed and blurred.
 *
 * The words are split across two places on purpose, following the reference.
 * WHO said it — stars, name, whose photograph it is, which piece — is set in
 * white on the plate itself, where it belongs to the face you are looking at.
 * WHAT they said is in a panel beneath the fan, where the quote gets a full
 * measure to be read at instead of a caption's worth of width.
 *
 * ── Why the photograph leads ────────────────────────────────────────────────
 * A shopper who has scrolled this far has already seen our photography. The one
 * image on the page they have not seen, and that cannot be styled, is a
 * customer's phone picture of the piece as it arrived. The catalogue shot is
 * the fallback so the fan never has a hole in it, and the plate caption says
 * which of the two is on screen.
 *
 * ── Why the transforms are imperative ───────────────────────────────────────
 * Every plate's transform changes on every frame. Through React state that is
 * sixty renders a second across seven elements. So the rAF loop writes straight
 * to `style` on refs, and React state carries only the ACTIVE INDEX — which
 * changes a few times a minute and drives the panel, the dots and the counter.
 *
 * Per-plate detail (the scrim, the caption, the seal) is CSS keyed off a
 * `--focus` custom property the loop sets alongside the transform. Declaring
 * that once in globals.css beats writing six more style properties per plate
 * per frame.
 *
 * ── The three interaction rules that are NOT the reference's ────────────────
 * 1. The wheel only listens to HORIZONTAL intent (`|deltaX| > |deltaY|`).
 *    Capturing vertical wheel would trap the page scroll inside a section a
 *    shopper is trying to scroll past, which is the single most hostile thing a
 *    homepage carousel can do.
 * 2. Arrow keys work only while focus is inside the carousel, not globally —
 *    same reason: arrow keys scroll the page everywhere else.
 * 3. Autoplay stops on hover, on focus, when the section leaves the viewport,
 *    and for RESUME_AFTER seconds after any interaction.
 *
 * Under `prefers-reduced-motion` the spring, the sway, the autoplay and the
 * blur are all dropped; the fan itself stays, because it is a layout rather
 * than a motion, and the arrows, dots and keys still work.
 */
export function ReviewCarousel({ reviews }: { reviews: CarouselReview[] }) {
  const count = reviews.length;

  const stageRef = useRef<HTMLDivElement>(null);
  const plateRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** Live index for the loop, which must not wait for a render to see a change. */
  const targetRef = useRef(0);
  const [active, setActive] = useState(0);
  /** Plate width and rings-per-side, both measured — see the resize effect. */
  const [{ plateW, win }, setFit] = useState({ plateW: 290, win: WINDOW });

  /** The reference's own plate proportion, 290 × 370. */
  const plateH = Math.round(plateW * (370 / 290));
  /**
   * How far from centre a plate can actually get, which is NOT always `win`.
   *
   * The ring's own half-length caps it: with three reviews nothing is ever more
   * than 1.5 steps out, so reserving two steps of fall would leave 70px of
   * empty stage under the fan and push the quote away from it. Half of the
   * count rather than `floor` of it, because mid-spring the carriage is
   * fractional and a three-plate ring genuinely reaches 1.5.
   */
  const spread = Math.min(win, count / 2);
  /**
   * The quote seal's diameter — the reference's 54px on its 290px plate, so a
   * share of the width, floored so it does not become a speck on a phone.
   *
   * Computed HERE rather than in PlateFace, even though only PlateFace draws
   * it, because the seal straddles the plate's bottom edge and the stage has to
   * reserve room for the half that hangs below. Two copies of this number is
   * how the seal ends up clipped on one breakpoint.
   */
  const seal = Math.max(30, Math.min(54, Math.round(plateW * 0.186)));

  /* ── Stage height, and why the plates are NOT vertically centred ───────────
     The plates used to hang off `top: 50%`, which wasted a lot of room. The
     stage has to be tall enough for the outer plates to FALL into, and falling
     only ever goes down — but centring split that reserve evenly above and
     below, so a band of empty stage sat over the centre plate where nothing can
     ever travel. On a phone that was about 40px of nothing between the section's
     subtitle and the top of the fan, and the same again below.

     So the plate is anchored near the TOP of the stage and the stage is sized
     to whichever actually reaches lowest — which is not always the same one:

       the CENTRE plate  never falls, but its seal hangs half below its edge;
       an OUTER plate    falls by `fall`, but has shrunk by then, so its bottom
                         may still sit above the centre plate's seal.

     Taking the max of the two is what stops this over-reserving on a wide
     screen and clipping on a narrow one. */
  /** Air above the fan. Covers the 4px idle sway and the 6px hover lift, which
      both move the centre plate UP, plus a little margin. */
  const TOP_PAD = 14;
  /** Air below the lowest thing on the stage. */
  const BOTTOM_PAD = 16;
  const fall = SAG * Math.pow(spread, BOW);
  /** The plate's top edge, in px from the top of the stage. */
  const plateTop = TOP_PAD;
  const centreReach = plateTop + plateH + seal / 2;
  const outerReach =
    plateTop + plateH / 2 + fall + (plateH * Math.pow(TAPER, spread)) / 2;
  const stageH = Math.round(Math.max(centreReach, outerReach) + BOTTOM_PAD);
  /** Pixels per index near the centre — the drag and flick maths needs this. */
  const step = BERTH * plateW;

  /** Mutable frame state. Never read during render. */
  const motion = useRef({
    carriage: 0,
    velocity: 0,
    /** Set while a pointer is down; the spring is suspended and the thumb leads. */
    dragging: false,
    /** Seconds accumulated toward the next autoplay advance. */
    dwell: 0,
    /** Seconds left of the post-interaction pause. */
    hold: 0,
    /** Seconds elapsed, for the sway sine. */
    clock: 0,
    paused: false,
    hovered: false,
    onScreen: true,
    reduced: false,
  });

  /** Move to an absolute index. Unbounded — the ring maths wraps it. */
  const goTo = useCallback(
    (index: number, interactive = true) => {
      targetRef.current = index;
      motion.current.dwell = 0;
      if (interactive) motion.current.hold = RESUME_AFTER;
      setActive(wrap(index, count));
    },
    [count],
  );

  const nudge = useCallback(
    (by: number) => goTo(targetRef.current + by),
    [goTo],
  );

  /** Jump to ring slot `slot` the short way round, however far the target has wound on. */
  const goToSlot = useCallback(
    (slot: number) => {
      let d = (slot - wrap(targetRef.current, count)) % count;
      if (d > count / 2) d -= count;
      if (d < -count / 2) d += count;
      goTo(targetRef.current + d);
    },
    [goTo, count],
  );

  /* ── Plate width tracks the container ─────────────────────────────────────
     A fixed 232px plate is right at 1440 and absurd at 390, where the fan would
     be wider than the phone. The plate is a share of the stage instead, floored
     so it never becomes a stamp and capped so it never dwarfs the type. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;

      // One ring per side on a phone, two above it. At BERTH 0.9 a two-ring fan
      // needs about 4.2 plate widths of room; on a 380px screen that puts the
      // plate at 90px, which is a stamp. Dropping to one ring buys back the
      // width and shows three plates properly instead of five badly.
      const rings = w < 720 ? 1 : WINDOW;

      // The widest plate whose fan still fits the stage. The outermost plate's
      // far edge sits at BERTH·pow(s,CROWD)·plateW from the centre, plus half
      // its own tapered width — solve that for plateW rather than guessing a
      // percentage, because the answer moves with the ring count AND with how
      // many reviews there are.
      //
      // ⚠️  Not cosmetic. The stage cannot be `overflow: hidden` — that forces
      // transform-style back to flat and kills the 3D — so a plate that does
      // not fit does not get clipped, it pushes the page sideways and gives the
      // whole storefront a horizontal scrollbar.
      const s = Math.min(rings, count / 2);
      const extent = BERTH * Math.pow(s, CROWD) + Math.pow(TAPER, s) / 2;
      const fits = ((w / 2) * 0.96) / extent;

      // 300 caps it on a desktop: the reference runs a 290px plate at 1920, and
      // going much past that makes the fan wider than the quote beneath it.
      setFit({
        plateW: Math.round(Math.max(120, Math.min(300, fits))),
        win: rings,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);

  /* ── Pause when off screen ───────────────────────────────────────────────
     A rAF loop transforming seven elements is cheap but not free, and a
     carousel advancing behind the fold is animation nobody asked for and
     nobody sees. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        motion.current.onScreen = entry.isIntersecting;
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ── The frame loop ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const readMotionPref = () => {
      motion.current.reduced = reduceQuery.matches;
    };
    readMotionPref();
    reduceQuery.addEventListener("change", readMotionPref);

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // Clamped: a backgrounded tab hands back a delta of several seconds, and
      // a spring integrated over that in one step explodes.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const m = motion.current;
      const target = targetRef.current;

      if (m.reduced) {
        m.carriage = target;
        m.velocity = 0;
      } else if (!m.dragging) {
        // Semi-implicit Euler: velocity updated first, then the NEW velocity
        // used for position. That is what keeps a stiff spring stable at 60fps
        // where the explicit form drifts.
        const accel = -TENSION * (m.carriage - target) - FRICTION * m.velocity;
        m.velocity += accel * dt;
        m.carriage += m.velocity * dt;
        // Snap once it is close enough to have stopped, or the loop keeps
        // writing sub-pixel transforms forever.
        if (
          Math.abs(m.carriage - target) < 0.0005 &&
          Math.abs(m.velocity) < 0.005
        ) {
          m.carriage = target;
          m.velocity = 0;
        }
      }

      m.clock += dt;

      // Autoplay. Every reason to stop is checked here rather than by tearing a
      // timer down and building it again, so resuming needs no setup.
      if (!m.reduced && !m.paused && m.onScreen && !m.hovered && !m.dragging) {
        if (m.hold > 0) {
          m.hold = Math.max(0, m.hold - dt);
        } else {
          m.dwell += dt;
          if (m.dwell >= DWELL) {
            m.dwell = 0;
            targetRef.current = target + 1;
            setActive(wrap(targetRef.current, count));
          }
        }
      }

      const sway = m.reduced
        ? 0
        : Math.sin((m.clock / SWAY_PERIOD) * Math.PI * 2) * SWAY;

      for (let i = 0; i < count; i++) {
        const el = plateRefs.current[i];
        if (!el) continue;

        // Shortest way round the ring, so the last plate slides in from the
        // left rather than racing back across the whole fan.
        let delta = (i - m.carriage) % count;
        if (delta > count / 2) delta -= count;
        if (delta < -count / 2) delta += count;

        const reach = Math.abs(delta);
        // Clamped at the ring count: further plates park at the edge instead of
        // flying off, which is what keeps a long ring cheap to draw.
        const shelf = Math.min(reach, win);
        const sign = delta === 0 ? 0 : delta > 0 ? 1 : -1;
        const focus = clamp01(1 - reach);
        /**
         * How far into the OUTERMOST ring this plate is, 0 until it leaves the
         * first one. Only the far ring is dimmed and blurred.
         *
         * ⚠️  This is the one that makes the fan look expensive, and it took
         * measuring the reference to find. The obvious rule — fade in
         * proportion to distance, `shelf / win` — dims and softens every plate
         * that is not dead centre, and the result is a fan of murk with one
         * sharp thing in it. The reference holds its immediate neighbours at
         * FULL opacity and perfectly sharp (measured: 1.0 and no filter at one
         * step out, 0.5 and 1.4px at two), so the eye reads three crisp plates
         * receding and a soft edge behind them, not a gradient of haze.
         *
         * With one ring (a phone) there is no outer ring to fade, so `rim`
         * stays 0 throughout and the three visible plates are all sharp.
         */
        const rim = win > 1 ? clamp01((shelf - 1) / (win - 1)) : 0;

        const lateral = sign * step * Math.pow(shelf, CROWD);
        const drop = SAG * Math.pow(shelf, BOW);
        const scale = Math.pow(TAPER, shelf);
        const lift =
          m.hovered && reach < 0.5 ? -HOVER_LIFT * (1 - reach * 2) : 0;

        el.style.transform =
          `translate3d(${lateral.toFixed(2)}px, ${(drop + sway + lift).toFixed(2)}px, ` +
          `${(-RECEDE * shelf).toFixed(2)}px) ` +
          `rotate(${(sign * CANT * shelf).toFixed(3)}deg) scale(${scale.toFixed(4)})`;
        el.style.opacity = (1 - VEIL * rim).toFixed(3);
        // `blur(0)` is not free — it still promotes the plate to its own layer
        // and, on the centre plate, visibly softens the photograph on a
        // fractional-DPR screen. No filter at all when there is nothing to blur.
        el.style.filter =
          m.reduced || rim === 0
            ? "none"
            : `blur(${(HAZE * rim).toFixed(2)}px)`;
        // Centre-most on top. Without this the stacking order is source order
        // and an outer plate sits over the hero.
        el.style.zIndex = String(1000 - Math.round(reach * 100));
        el.style.setProperty("--focus", focus.toFixed(3));
        // Only the centred plate takes a click; elsewhere the press falls
        // through to the stage and reads as a drag.
        el.style.pointerEvents = reach < 0.5 ? "auto" : "none";
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      reduceQuery.removeEventListener("change", readMotionPref);
    };
  }, [count, step, win]);

  /* ── Drag and flick ──────────────────────────────────────────────────────── */
  const drag = useRef({
    id: -1,
    startX: 0,
    startCarriage: 0,
    lastX: 0,
    lastT: 0,
    moved: false,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    // Left button, touch or pen only — a right-click must not start a drag.
    if (e.button !== 0) return;
    const m = motion.current;
    m.dragging = true;
    m.velocity = 0;
    m.hold = RESUME_AFTER;
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      startCarriage: m.carriage,
      lastX: e.clientX,
      lastT: performance.now(),
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!motion.current.dragging || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > DRAG_SLOP) d.moved = true;
    // Dragging right brings the plate on the LEFT to centre, so the carriage
    // moves against the thumb.
    motion.current.carriage = d.startCarriage - dx / step;

    const now = performance.now();
    const dt = (now - d.lastT) / 1000;
    // Sampled over at least ~8ms: two moves in the same millisecond divide by
    // near-zero and produce a velocity that throws the fan across the ring.
    if (dt > 0.008) {
      motion.current.velocity = -(e.clientX - d.lastX) / step / dt;
      d.lastX = e.clientX;
      d.lastT = now;
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!motion.current.dragging || d.id !== e.pointerId) return;
    motion.current.dragging = false;
    d.id = -1;
    // Throw distance from release velocity, then settle on a whole plate.
    // Capped at one plate per flick: a hard swipe that spins through five
    // reviews shows none of them.
    const thrown = Math.max(-1, Math.min(1, motion.current.velocity * FLICK));
    goTo(Math.round(motion.current.carriage + thrown));
  };

  /* ── Wheel, horizontal intent only ──────────────────────────────────────── */
  const wheelLock = useRef(0);
  const wheelSum = useRef(0);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // A vertical wheel is the shopper scrolling the page. Leave it entirely
      // alone — see the interaction note in this component's doc comment.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock.current) return;
      wheelSum.current += e.deltaX;
      if (Math.abs(wheelSum.current) >= WHEEL_THRESHOLD) {
        nudge(wheelSum.current > 0 ? 1 : -1);
        wheelSum.current = 0;
        wheelLock.current = now + WHEEL_LOCKOUT;
      }
    };
    // Not passive, because the horizontal case is preventDefault-ed above.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [nudge]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      nudge(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nudge(1);
    }
  };

  const activeReview = reviews[active];

  // Horizontally centred by a negative margin against `left: 50%`, so the
  // loop's lateral transform is a pure offset from the middle and needs no
  // half-width correction in the maths.
  //
  // Vertically it is anchored to the TOP instead — see the stage-height note
  // above for why centring wasted a band of stage the plates never reach.
  const plateStyle = useMemo(
    () => ({
      width: plateW,
      height: plateH,
      marginLeft: -plateW / 2,
      top: plateTop,
    }),
    [plateW, plateH, plateTop],
  );

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Customer reviews"
      onMouseEnter={() => {
        motion.current.hovered = true;
      }}
      onMouseLeave={() => {
        motion.current.hovered = false;
      }}
      onFocusCapture={() => {
        motion.current.paused = true;
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          motion.current.paused = false;
      }}
    >
      {/* ── The stage ──────────────────────────────────────────────────────
          `perspective` lives here rather than on each plate: one shared
          vanishing point is what makes the fan read as a single object
          receding, where a per-plate perspective gives each its own and the
          arc falls apart. `touch-pan-y` keeps a vertical swipe scrolling the
          page while a horizontal one drives the carousel. */}
      <div
        ref={stageRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="review-stage relative w-full cursor-grab touch-pan-y select-none outline-none focus-visible:ring-1 focus-visible:ring-black active:cursor-grabbing"
        style={{ height: stageH, perspective: "1500px" }}
      >
        {reviews.map((review, i) => (
          <div
            key={review.id}
            ref={(el) => {
              plateRefs.current[i] = el;
            }}
            className="review-plate absolute left-1/2 will-change-transform"
            style={plateStyle}
            aria-hidden={i !== active}
          >
            <PlateFace
              review={review}
              plateW={plateW}
              seal={seal}
              isActive={i === active}
              onSelect={(e) => {
                // A drag that happened to end over a plate must not navigate.
                if (drag.current.moved) e.preventDefault();
              }}
            />
          </div>
        ))}
      </div>

      {/* ── The words ────────────────────────────────────────────────────────
          Every review's panel is mounted and stacked in ONE grid cell, so the
          block is as tall as the longest quote and never resizes as the fan
          turns — and, just as importantly, so all six reviews are in the HTML
          for a crawler rather than one at a time. The inactive ones are
          aria-hidden and hold no tab stops. */}
      <div className="mx-auto mt-10 grid max-w-xl text-center">
        {reviews.map((review, i) => (
          <div
            key={review.id}
            data-active={i === active ? "true" : undefined}
            aria-hidden={i !== active}
            className="review-panel col-start-1 row-start-1"
          >
            <p className="review-rise numeral text-micro tracking-[0.14em] text-grey">
              {String(i + 1).padStart(2, "0")} /{" "}
              {String(count).padStart(2, "0")}
            </p>

            {/* The stars and the attribution now sit ON the plate, where the
                reference puts them. What is left here is the review itself —
                which is the point of the panel, and reads far better without a
                second copy of the name under it. The plate is the link to the
                piece, so nothing has lost its way to the product page. */}
            {review.title && (
              <h3 className="review-rise review-rise-2 mt-4 text-h3 text-foreground">
                {review.title}
              </h3>
            )}

            <blockquote className="review-rise review-rise-3 mt-3 text-sm leading-relaxed text-muted-foreground">
              {review.comment}
            </blockquote>
          </div>
        ))}
      </div>

      {/* Announced separately from the panels: five of the six are hidden, and
          a live region on a hidden node says nothing. This one short line is
          what a screen reader hears on each advance. */}
      <p className="sr-only" aria-live="polite">
        {activeReview
          ? `Review ${active + 1} of ${count}. ${activeReview.rating} stars from ${activeReview.authorName} on ${activeReview.product.name}.`
          : ""}
      </p>

      {/* ── Controls ─────────────────────────────────────────────────────────
          Dropped entirely below two reviews. A new shop can legitimately have
          one qualifying review, and arrows that visibly do nothing beside a
          single dot read as a section that failed to load. */}
      {count > 1 && (
        <div className="mt-8 flex items-center justify-center gap-5">
          <Nib label="Previous review" onClick={() => nudge(-1)}>
            <ArrowLeft className="size-4" aria-hidden />
          </Nib>

          <div className="flex items-center gap-1">
            {reviews.map((review, i) => (
              <button
                key={review.id}
                type="button"
                aria-label={`Show review ${i + 1} of ${count}`}
                aria-current={i === active ? "true" : undefined}
                onClick={() => goToSlot(i)}
                // The hit area is 24px square; the mark inside it is 6px. A 6px
                // button is a 6px target, which fails under a thumb.
                className="grid size-6 place-items-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black"
              >
                {/* The active mark is a PILL, not a bigger dot — the
                    reference's affordance, and the better one: length reads as
                    "you are here" at a glance where a 25% diameter change does
                    not. Width is animated, so it stretches into place. */}
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    i === active
                      ? "w-5 bg-black"
                      : "w-1.5 bg-half-grey hover:bg-grey"
                  }`}
                />
              </button>
            ))}
          </div>

          <Nib label="Next review" onClick={() => nudge(1)}>
            <ArrowRight className="size-4" aria-hidden />
          </Nib>
        </div>
      )}
    </div>
  );
}

/**
 * One plate: the photograph, its white frame, and the caption that fades up as
 * it takes centre.
 *
 * The whole face is a link to the product being reviewed — the point of this
 * section is that a shopper can check the claim and then buy the piece that
 * earned it. Off-centre plates get `pointer-events: none` from the loop, so a
 * press there falls through to the stage and reads as a drag instead.
 */
function PlateFace({
  review,
  plateW,
  seal,
  isActive,
  onSelect,
}: {
  review: CarouselReview;
  plateW: number;
  /** Diameter of the quote seal. Passed in, not derived — the stage reserves
      room for the half of it that hangs below the plate. */
  seal: number;
  isActive: boolean;
  onSelect: (e: React.MouseEvent) => void;
}) {
  /* Everything on the plate is a share of its width, because the plate itself
     runs from 300px on a desktop down to about 130 on a phone and a fixed size
     that suits one is absurd on the other. The shares are the reference's, read
     off its 290px plate: a 5px bezel, a 54px seal, a 20px name over 12px meta.
     Each is then clamped so a phone stays legible rather than merely
     proportional — below about 12px this is white text over a photograph, and
     proportion loses to readability. */
  const bezel = Math.max(3, Math.round(plateW * 0.017));
  const nameSize = Math.max(13, Math.min(20, Math.round(plateW * 0.069)));
  const metaSize = Math.max(9, Math.min(12, Math.round(plateW * 0.041)));

  return (
    <Link
      href={`/products/${review.product.slug}`}
      transitionTypes={["nav-forward"]}
      onClick={onSelect}
      // Off-centre plates are aria-hidden by their wrapper; a tab stop inside
      // one is focus a screen reader cannot account for.
      tabIndex={isActive ? undefined : -1}
      // A drag must not start the browser's native image drag.
      draggable={false}
      className="relative block size-full"
      style={{ padding: bezel }}
    >
      {/* The white frame, as its own layer rather than a background on the link
          — it fades with `--focus` (see globals.css), and a background cannot
          be faded without taking the photograph with it. First in the DOM and
          unpositioned in the flow, so the `relative` well below paints over it
          without needing a negative z-index. */}
      <span
        aria-hidden
        className="review-frame absolute inset-0 bg-white shadow-[0_34px_66px_-20px_rgba(0,0,0,0.28),0_10px_26px_-10px_rgba(0,0,0,0.14)]"
      />

      <div className="relative size-full overflow-hidden bg-half-white">
        {review.image && (
          <Image
            src={review.image}
            alt={
              review.isCustomerPhoto
                ? `${review.authorName}'s photo of ${review.product.name}`
                : review.product.name
            }
            fill
            // The plate is 300px at its widest and the centred one is scale 1,
            // so 2x on a phone and a fixed cap on desktop. Getting this wrong
            // downloads six full-width images for a fan of thumbnails.
            sizes="(max-width: 640px) 55vw, 300px"
            draggable={false}
            className="review-shot object-cover"
          />
        )}

        {/* Bottom fade. Strongest on the outer plates and lifting as one takes
            centre, so the fan reads as depth and the hero reads as lit. */}
        <span
          className="review-scrim pointer-events-none absolute inset-x-0 bottom-0 h-3/5"
          aria-hidden
        />

        {/* ── Who said it, on the photograph ────────────────────────────────
            The reference puts the person's identity here — name over role over
            location — and keeps the panel below for the quote alone. Ours maps
            onto the same three slots with what a jewellery shopper actually
            needs: the name, whose camera took the picture, and which piece is
            in it. The provenance line is the one that earns its place; a phone
            photo of the real thing is worth more here than our studio shot, and
            saying which is which is what makes that legible.

            Padded off the bottom edge by a share of the plate height, not a
            fixed value, so the block sits in the same place on a phone. */}
        <span
          className="review-ident pointer-events-none absolute inset-x-0 bottom-0 px-3 text-center"
          style={{ paddingBottom: `13%` }}
        >
          <span className="flex justify-center gap-0.5" aria-hidden>
            {Array.from({ length: 5 }, (_, s) => (
              <Star
                key={s}
                className={
                  s < review.rating
                    ? "size-2.5 fill-white text-white"
                    : "size-2.5 text-white/35"
                }
              />
            ))}
          </span>
          <span
            className="mt-1.5 block truncate font-medium text-white"
            style={{ fontSize: nameSize }}
          >
            {review.authorName}
          </span>
          <span
            className="mt-0.5 block truncate uppercase tracking-[0.1em] text-white/70"
            style={{ fontSize: metaSize }}
          >
            {review.isCustomerPhoto ? "Customer photo" : "Our photograph"}
          </span>
          <span
            className="block truncate text-white/85"
            style={{ fontSize: metaSize }}
          >
            {review.product.name}
          </span>
        </span>
      </div>

      {/* The quote seal, straddling the BOTTOM edge — the reference's placement,
          measured: a 54px disc whose centre sits within 5px of the plate's
          bottom. It reads as a stamp closing the card. Scales in from nothing as
          the plate arrives; see the `--focus` cascade in globals.css. */}
      <span
        aria-hidden
        className="review-seal absolute left-1/2 grid place-items-center rounded-full bg-white text-black shadow-[0_8px_22px_-7px_rgba(0,0,0,0.4)]"
        style={{ width: seal, height: seal, bottom: -seal / 2 }}
      >
        <Quote className="size-1/3 fill-current" />
      </span>
    </Link>
  );
}

/** A round arrow button. Named for the reference component's own control. */
function Nib({
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
      aria-label={label}
      onClick={onClick}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-hairline text-black transition-colors hover:border-black hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black"
    >
      {children}
    </button>
  );
}
