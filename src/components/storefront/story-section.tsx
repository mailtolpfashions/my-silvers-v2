import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
}: {
  title: string;
  eyebrow?: string;
  stages: string[];
  image: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    // Deliberately outside container-page: edge to edge is the whole point of
    // this section, and it is the only full-bleed block on the homepage.
    <section className="relative isolate min-h-[70vh] overflow-hidden lg:min-h-[85vh]">
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

      <div className="container-page flex min-h-[70vh] items-end py-20 lg:min-h-[85vh] lg:py-28">
        <div className="max-w-xl">
          {eyebrow && <p className="label-eyebrow label-eyebrow-light mb-4">{eyebrow}</p>}
          {/* text-white spelled out: the base layer colours every heading
              directly, and a direct rule beats the inherited one. Same trap as
              the hero carousel. */}
          <h2 className="text-h2 font-heading text-white">{title}</h2>

          {stages.length > 0 && (
            <div className="mt-6 space-y-3">
              {stages.map((stage, i) => (
                <p key={i} className="text-lead text-white/85">
                  {stage}
                </p>
              ))}
            </div>
          )}

          {/* Light pill: the default primary is graphite-950, which on a dark
              photograph under a dark scrim is a black button on a black
              background — the label reads but the control disappears. */}
          {ctaLabel && ctaHref && (
            <Button
              asChild
              size="lg"
              className="mt-8 h-12 rounded-full bg-white px-8 text-graphite-950 hover:bg-ivory-200"
            >
              <Link href={ctaHref}>{ctaLabel}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
