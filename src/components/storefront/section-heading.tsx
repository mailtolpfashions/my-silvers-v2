/**
 * The heading block above a section: eyebrow, heading, one explanatory line.
 *
 * Extracted from homepage-section.tsx so the editorial pair, the journal row
 * and any future section share one rhythm rather than each re-implementing it.
 *
 * `align` exists because centring everything was flattening the page. When
 * every section announces itself with the same centred three-line block, the
 * page has no shape — each one reads as equally important, which is the same as
 * none of them being important. The rule now:
 *
 *   center  editorial beats — the pairs, the craft claims, social proof
 *   left    commerce grids — new in, bestsellers, a catalogue listing
 *
 * Full-bleed blocks (story, category doorways) pass no heading at all; they
 * name themselves.
 */
export function SectionHeading({
  title,
  eyebrow,
  subtitle,
  align = "left",
  /** Rendered to the right of a left-aligned heading — usually a "view all". */
  action,
}: {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  align?: "left" | "center";
  action?: React.ReactNode;
}) {
  if (!title && !eyebrow && !subtitle) return null;

  const centered = align === "center";

  return (
    <div
      className={`mb-10 sm:mb-14 ${
        centered
          ? "text-center"
          : "flex flex-wrap items-end justify-between gap-x-8 gap-y-4"
      }`}
    >
      <div className={centered ? "" : "min-w-0"}>
        {eyebrow && <p className="label-eyebrow mb-3">{eyebrow}</p>}
        {title && <h2 className="text-h2">{title}</h2>}
        {subtitle && (
          <p
            className={`text-lead mt-3 max-w-prose text-muted-foreground ${
              centered ? "mx-auto" : ""
            }`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {/* Only ever hung off a left-aligned heading — a centred heading has no
          right edge to hang it from, so those sections put their action below
          the grid instead. */}
      {!centered && action}
    </div>
  );
}
