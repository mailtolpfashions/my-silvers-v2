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
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
