/**
 * Placeholder for HeaderAccount while it streams.
 *
 * The three boxes are `size-8` because that is exactly what `Button size="icon"`
 * renders (see src/components/ui/button.tsx) — if the two ever drift apart the
 * header will shift as the island resolves. Change both or neither.
 *
 * The Admin/CMS links are intentionally absent: they are `hidden lg:inline-flex`
 * and only render for staff, so reserving space for them would shift the header
 * for every ordinary shopper to spare a shift for a handful of admins.
 */
export function HeaderAccountSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="size-8 rounded-lg" aria-hidden />
      ))}
      <span className="sr-only">Loading account</span>
    </>
  );
}
