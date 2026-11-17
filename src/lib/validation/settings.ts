import { z } from "zod";

/**
 * Field rules shared by the Settings and Courier pages' save actions — kept
 * here because a "use server" file may only export async functions.
 */

/**
 * Rupees, not paise, because that is what the admin types into the form.
 * Converted in the action so paise stays the only unit that exists below it —
 * the same rule the order math follows.
 */
export const rupees = z
  .number({ message: "Enter an amount in rupees." })
  .min(0, "Amount cannot be negative.")
  // A shipping charge in the tens of thousands is a typo, not a price. The cap
  // is deliberately generous rather than precise — it exists to catch a stray
  // extra zero before it silently reprices every order in the shop.
  .max(100000, "That looks too large — enter the amount in rupees.")
  .refine((n) => Number.isFinite(n) && Math.round(n * 100) === n * 100, {
    message: "Amounts can have at most two decimal places.",
  });

/**
 * A count of days. Whole numbers only, and capped at a year — these are typed
 * into a form and then published to Google as a return window or a delivery
 * estimate, where a stray digit becomes a public promise of a 70-day dispatch.
 */
export const days = z
  .number({ message: "Enter a whole number of days." })
  .int("Days must be a whole number.")
  .min(0, "Days cannot be negative.")
  .max(365, "That looks too large — enter a number of days.");
