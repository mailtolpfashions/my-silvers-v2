/**
 * Sorting for rows that are already in memory.
 *
 * Most admin tables sort in the database, which is the right place — it works
 * across pages and survives a refresh. This is for the two cases that cannot:
 * a table whose rows live in React state (see useTableSort), and a table whose
 * rows are computed rather than queried (the partner split on /admin/finance).
 *
 * No directive on this module on purpose, so both a client hook and a server
 * component can import it. Keep it free of anything environment-specific.
 */

export type SortDir = "asc" | "desc";

/** What a column can be sorted on. Empty values always sort last. */
export type SortValue = string | number | boolean | null | undefined;

function isEmpty(value: SortValue): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Returns a new array ordered by `read`.
 *
 * Comparison rules, all chosen so a column never reorders arbitrarily:
 *  - Strings use localeCompare, so "Ürsula" files next to "Ursula" rather than
 *    after "Zoe", and numeric:true keeps "Size 10" after "Size 9".
 *  - Empty values sort last in BOTH directions. Flipping a column to descending
 *    should surface the largest values, not a block of dashes.
 *  - Ties keep the input order, which is the meaningful one the caller chose.
 *    Array.prototype.sort is stable, so this needs no tiebreaker.
 */
export function sortRows<T>(rows: T[], read: (row: T) => SortValue, dir: SortDir): T[] {
  const factor = dir === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const av = read(a);
    const bv = read(b);

    // Not multiplied by `factor` — empties stay at the bottom either way.
    if (isEmpty(av) || isEmpty(bv)) {
      if (isEmpty(av) && isEmpty(bv)) return 0;
      return isEmpty(av) ? 1 : -1;
    }

    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv, "en-IN", { numeric: true, sensitivity: "base" }) * factor;
    }
    return (Number(av) - Number(bv)) * factor;
  });
}
