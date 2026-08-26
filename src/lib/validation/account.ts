import { z } from "zod";

/** A customer may keep at most this many saved delivery addresses. */
export const MAX_ADDRESSES = 5;

export const TITLES = ["mr", "mrs", "ms"] as const;

export const TITLE_LABELS: Record<(typeof TITLES)[number], string> = {
  mr: "Mr",
  mrs: "Mrs",
  ms: "Ms",
};

/** States and union territories — matches what couriers expect for Indian addresses. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam",
  "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;

/**
 * Indian mobile numbers are 10 digits starting 6–9. Accepts an optional +91 or
 * 0 prefix and any spacing/dashes, then normalises to bare 10 digits so the
 * same number is never stored two different ways.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-()]/g, ""))
  .refine((value) => /^(\+?91|0)?[6-9]\d{9}$/.test(value), {
    message: "Enter a valid 10-digit Indian mobile number.",
  })
  .transform((value) => value.replace(/^(\+?91|0)/, ""));

/** Indian PIN codes are 6 digits and never start with 0. */
export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code.");

/**
 * The state each PIN zone covers.
 *
 * India Post divides the country into nine zones, and the FIRST DIGIT of every
 * PIN code names one. It is the most stable fact about the numbering scheme —
 * unchanged through every state reorganisation since 1972, because the zones
 * are postal regions rather than political ones.
 *
 * ── What this catches, and what it does not ─────────────────────────────────
 * ⚠️  Zone granularity only. "Punjab" with a Chennai PIN is caught, because
 * those are zones 1 and 6. "Punjab" with a Delhi PIN is NOT, because both sit
 * in zone 1.
 *
 * That is a deliberate stopping point rather than laziness. Going finer means a
 * table of ~100 postal-circle prefixes, and every error in it is a REAL ORDER
 * REFUSED — a shopper told their own PIN code is invalid, who then leaves. A
 * coarse check that is certainly right beats a precise one that is probably
 * right, when the cost of a false rejection is a lost sale and the cost of a
 * miss is a courier query.
 *
 * If a finer check is ever wanted, derive it from India Post's published
 * circle data rather than by hand, and treat an unrecognised prefix as VALID.
 */
const PIN_ZONE_STATES: Record<string, readonly string[]> = {
  "1": ["Delhi", "Haryana", "Punjab", "Himachal Pradesh", "Jammu and Kashmir", "Ladakh", "Chandigarh"],
  "2": ["Uttar Pradesh", "Uttarakhand"],
  "3": ["Rajasthan", "Gujarat", "Dadra and Nagar Haveli and Daman and Diu"],
  "4": ["Maharashtra", "Madhya Pradesh", "Chhattisgarh", "Goa"],
  "5": ["Andhra Pradesh", "Telangana", "Karnataka", "Puducherry"],
  "6": ["Tamil Nadu", "Kerala", "Puducherry", "Lakshadweep"],
  "7": [
    "West Bengal", "Odisha", "Assam", "Sikkim", "Arunachal Pradesh", "Nagaland",
    "Manipur", "Mizoram", "Tripura", "Meghalaya", "Andaman and Nicobar Islands",
  ],
  "8": ["Bihar", "Jharkhand"],
  // Zone 9 is the Army Postal Service, which belongs to no civilian state. A
  // 9xxxxx PIN is accepted with any state rather than refused — a serving
  // customer's address is not ours to second-guess.
};

/**
 * Whether a PIN code's zone is consistent with the chosen state.
 *
 * Returns true when it cannot tell — an unknown zone, or a state not in the
 * table — because the job here is catching obvious mismatches, not adjudicating
 * addresses. Only a confident contradiction returns false.
 *
 * ⚠️  Puducherry appears under TWO zones on purpose. The union territory is
 * geographically scattered: Puducherry and Karaikal sit inside Tamil Nadu
 * (zone 6), Mahe inside Kerala (also 6), but Yanam is inside Andhra Pradesh
 * (zone 5). Listing it once would refuse every genuine Yanam address.
 */
export function pincodeMatchesState(pincode: string, state: string): boolean {
  const zone = pincode.trim()[0];
  const allowed = PIN_ZONE_STATES[zone];
  if (!allowed) return true;
  return allowed.includes(state.trim());
}

/** The message both address forms show when the two disagree. */
export const PINCODE_STATE_MISMATCH =
  "This PIN code isn't in the state you selected. Check both before continuing.";

export const profileSchema = z.object({
  title: z.enum(TITLES).optional().or(z.literal("").transform(() => undefined)),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(80, "Name must be 80 characters or fewer."),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined))
    .refine(
      (value) => {
        if (!value) return true;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return false;
        if (date > new Date()) return false;
        // Nothing plausible predates this; catches typos like year 0202.
        return date > new Date("1900-01-01");
      },
      { message: "Enter a valid date of birth in the past." }
    ),
});

export const addressSchema = z.object({
  label: z
    .string()
    .trim()
    .max(30, "Label must be 30 characters or fewer.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  fullName: z
    .string()
    .trim()
    .min(2, "Enter the recipient's full name.")
    .max(80, "Name must be 80 characters or fewer."),
  phone: phoneSchema,
  addressLine1: z.string().trim().min(5, "Enter the house/flat and street.").max(120),
  addressLine2: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  city: z.string().trim().min(2, "Enter a city.").max(60),
  state: z.enum(INDIAN_STATES, { message: "Select a state." }),
  pincode: pincodeSchema,
  isDefault: z.boolean().optional(),
})
  /**
   * The two fields have to agree. Each was valid on its own, so a Chennai PIN
   * code sat happily under "Punjab" and the order went through — the courier
   * finds out, days later, at the shop's expense.
   *
   * A cross-field rule, so it belongs on the object rather than either field.
   * The error is attached to `pincode` because that is the one a shopper is
   * more likely to have mistyped; the state came from a dropdown.
   */
  .superRefine((value, ctx) => {
    if (!pincodeMatchesState(value.pincode, value.state)) {
      ctx.addIssue({
        code: "custom",
        path: ["pincode"],
        message: PINCODE_STATE_MISMATCH,
      });
    }
  });

export type ProfileInput = z.infer<typeof profileSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
