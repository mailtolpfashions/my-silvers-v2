/**
 * The heading block above a section: eyebrow, heading, one explanatory line.
 *
 * Extracted from homepage-section.tsx so the editorial pair, the journal row
 * and any future section share one rhythm rather than each re-implementing it.
 *
 * ── Every section heading is centred ─────────────────────────────────────────
 * There used to be an `align` prop, and a rule behind it: editorial beats
 * centred, commerce grids left with a "view all" hung off the right edge. The
 * argument for it was that centring everything flattens the page, since a
 * column of identical centred three-line blocks makes every section read as
 * equally important.
 *
 * In practice the split read as a mistake rather than as hierarchy — a page
 * where some headings sit centred and the next one starts at the left margin
 * looks unaligned, not deliberate. One axis for all of them is the decision
 * now. If a section ever needs to be set apart again, do it with something
 * that reads as intent — a rule, a different type size, more space around it —
 * rather than by moving it off the page's centre line.
 *
 * Full-bleed blocks (story, category doorways) pass no heading at all; they
 * name themselves.
 *
 * ── There is no `action` slot any more ───────────────────────────────────────
 * A centred heading has no right edge to hang a "view all" from. Sections that
 * have one render it centred BELOW their grid, which is the order a shopper
 * uses it in anyway: the heading, the pieces, then the way to see more. See the
 * `viewAll` block in homepage-section.tsx.
 */
export function SectionHeading({
  title,
  eyebrow,
  subtitle,
}: {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
}) {
  if (!title && !eyebrow && !subtitle) return null;

  return (
    // `section-heading` carries no styling of its own — it is the hook
    // .fit-viewport uses to tighten this block's bottom margin, so a section
    // that has to fit one screen spends less of it on the gap under its title.
    // See globals.css.
    <div className="section-heading mb-10 text-center sm:mb-14">
      {eyebrow && <p className="label-eyebrow mb-3">{eyebrow}</p>}
      {title && <h2 className="text-h2">{title}</h2>}
      {subtitle && (
        <p className="text-lead mx-auto mt-3 max-w-prose text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}
