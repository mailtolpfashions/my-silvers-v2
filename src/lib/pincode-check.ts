/** The answer to "can this pincode be delivered to?" — see api/shipping/pincode. */
export type PincodeCheck =
  | { status: "serviceable"; estimatedDays: number | null }
  | { status: "unserviceable" }
  | { status: "unknown" };

/**
 * Asks /api/shipping/pincode. Never throws: a network failure is "unknown",
 * which never blocks an order — only a definite "unserviceable" does.
 */
export async function fetchPincodeCheck(pincode: string, cod: boolean): Promise<PincodeCheck> {
  try {
    const res = await fetch(`/api/shipping/pincode?pincode=${encodeURIComponent(pincode)}&cod=${cod ? 1 : 0}`);
    if (!res.ok) return { status: "unknown" };
    return (await res.json()) as PincodeCheck;
  } catch {
    return { status: "unknown" };
  }
}
