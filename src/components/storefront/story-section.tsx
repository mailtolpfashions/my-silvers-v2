import Image from "next/image";
import { EditorialLink } from "@/components/storefront/editorial-link";

/**
 * A full-bleed photograph with the brand's own words over it.
 *
 * This began as a pinned, scroll-scrubbed section built on GSAP: the image held
 * under the viewport while the copy advanced in stages. It was replaced with
 * this after measuring the reference site the design is aimed at, which turned
 * out to run zero animation JavaScript — 59 CSS transition rules in 1,761, no
 * scroll library, no reveals. What reads as expensive there is the photograph
 * at full width with a great deal of space around it, not motion.
 *
 * So the section keeps its shape and loses its machinery. It is a server
 * component now, with no client JavaScript at all.
 *
 * The stages stay a list rather than becoming one paragraph: they are authored
 * as separate lines in the CMS, and set as separate lines they read as a
 * sequence of statements, which is the tone this section is for.
 */
export function StorySection({
  title,
  eyebrow,
  stages,
  image,
  ctaLabel,
  ctaHref,
  fill = false,
}: {
  title: string;
  eyebrow?: string;
  stages: string[];
  image: string;
  ctaLabel?: string;
  ctaHref?: string;
  /**
   * Fill the parent's height instead of setting a min-height of its own.
   *
   * Set when this section is a stage in the homepage's shutter chain, where the
   * pinned wrapper is exactly one viewport tall and owns the height. The
   * section's own `min-h-[85vh]` would otherwise overflow that wrapper by 15vh
   * at lg and push its copy below the fold for the whole reveal.
   *
   * `isolate` on the section is what keeps this safe inside a stage: the -z-10
   * image and scrim below resolve against this section's own stacking context
   * rather than escaping to sit behind the stage — and behind the stage is
   * where the PREVIOUS stage is.
   */
  fill?: boolean;
}) {
  const frame = fill ? "h-full" : "min-h-[70vh] lg:min-h-[85vh]";

  return (
    // Deliberately outside container-page: edge to edge is the whole point of
    // this section, and it is the only full-bleed block on the homepage.
    <section className={`relative isolate overflow-hidden ${frame}`}>
      <Image
        src={image}
        alt=""
        fill
        className="-z-10 object-cover object-center"
        sizes="100vw"
      />

      {/* Scrim heavy enough to carry white text over an arbitrary uploaded
          photograph — the same problem the category banner solves. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to top, rgba(12,12,14,0.75) 0%, rgba(12,12,14,0.35) 55%, rgba(12,12,14,0.15) 100%)",
        }}
      />

      <div className={`container-page flex items-end py-20 lg:py-28 ${frame}`}>
        <div className="max-w-xl">
          {eyebrow && <p className="label-eyebrow label-eyebrow-light mb-4">{eyebrow}</p>}
          {/* text-white spelled out: the base layer colours every heading
              directly, and a direct rule beats the inherited one. Same trap as
              the hero carousel. */}
          <h2 className="text-h2 font-heading text-white">{title}</h2>

          {/* The one place on the storefront outside the journal where the
              serif appears. Playfair is loaded for the brand and was rendering
              nothing at all; this is the brand speaking in its own voice about
              its own craft, which is exactly the role a display serif earns.
              It stays out of the UI — product names, navigation, prices and
              anything a shopper has to scan are the body sans, always. */}
          {stages.length > 0 && (
            <div className="mt-6 space-y-3">
              {stages.map((stage, i) => (
                <p key={i} className="font-serif text-lg leading-relaxed text-white/85 sm:text-xl">
                  {stage}
                </p>
              ))}
            </div>
          )}

          {/* An editorial link, not a block button. This section is the brand
              speaking about its own craft — a filled CTA turns a statement into
              an advertisement. `light` for the white rule that reads over a
              dark photograph. */}
          {ctaLabel && ctaHref && (
            <div className="mt-8">
              <EditorialLink href={ctaHref} light>
                {ctaLabel}
              </EditorialLink>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
