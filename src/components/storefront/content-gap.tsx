/**
 * A development-only marker for content the design expects but nobody has
 * authored yet.
 *
 * The rule this exists to serve: the storefront must never invent a business
 * claim, and it must never quietly hide the fact that one is missing. Those two
 * pull in opposite directions — rendering nothing is correct for a shopper and
 * invisible to the team, so a returns policy can stay unwritten for months
 * without anyone noticing.
 *
 * So: nothing at all in production, and a plainly ugly amber note in
 * development. The ugliness is deliberate. It is not part of the design system
 * and should never look like it is.
 *
 * `process.env.NODE_ENV` is inlined at build time, so the whole subtree is
 * dead-code-eliminated from the production bundle rather than merely hidden.
 */
export function ContentGap({
  label,
  detail,
  where,
}: {
  /** What is missing, in the words an editor would use. */
  label: string;
  /** Why it matters / what to do about it. */
  detail: string;
  /** Where to author it — a CMS path or an admin screen. */
  where: string;
}) {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      data-content-gap
      className="my-4 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
    >
      <strong className="font-semibold">Missing content (dev only):</strong> {label}
      <br />
      {detail}
      <br />
      <span className="opacity-80">Author it at: {where}</span>
    </div>
  );
}
