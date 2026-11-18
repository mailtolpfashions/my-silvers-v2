/**
 * A photo's file name read as "SKU + photo number", for Products → Bulk photos.
 *
 *   MYS-RNG-001.jpg        → MYS-RNG-001, photo 1
 *   MYS-RNG-001_2.jpg      → MYS-RNG-001, photo 2
 *   MYS-RNG-001-2.jpg      → MYS-RNG-001, photo 2
 *   MYS-RNG-001 (3).jpg    → MYS-RNG-001, photo 3   ← Windows' own bulk rename
 *
 * Both readings are offered to the server — the whole name, and the name with
 * a trailing number taken off — and the whole name wins when it is a real SKU.
 * That is what keeps "MYS-RNG-01" (a SKU that happens to end in a number) from
 * being read as photo 1 of "MYS-RNG".
 */
export function readPhotoName(fileName: string): { whole: string; stripped: string | null; n: number | null } {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  const m = base.match(/^(.*?)(?:\s*\((\d{1,2})\)|[_-](\d{1,2}))$/);
  if (!m || !m[1]) return { whole: base, stripped: null, n: null };
  return { whole: base, stripped: m[1].trim(), n: Number(m[2] ?? m[3]) };
}
