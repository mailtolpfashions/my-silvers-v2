"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";

/**
 * Writes to the partners' books.
 *
 * ⚠️  Every action here re-checks `admin` before it does anything, and none of
 * them accepts a role argument or an "on behalf of" parameter. These figures
 * are the most sensitive data in the application; an entry point that trusts
 * its caller is a leak waiting for the first person who calls it from a new
 * place. See the note at the top of src/server/admin/finance.ts.
 *
 * Nothing here is cached with `cacheTag` — the finance page is admin-only and
 * always reads live. `revalidatePath` is enough and keeps the money figures
 * from ever being served from a stale entry.
 */

export type FinanceActionResult = { ok: true } | { ok: false; error: string };

const FINANCE_PATH = "/admin/finance";

/** Rupees, to two places, and never negative. */
const amount = z
  .number()
  .finite()
  .min(0.01, "Enter an amount greater than zero.")
  .max(99_999_999, "That amount is too large to record here.");

/**
 * A date-only string from an <input type="date">.
 *
 * Parsed as LOCAL midnight rather than through `new Date(iso)`, which would
 * read it as UTC and file an expense entered on the 1st into the previous month
 * for anyone east of Greenwich — which is everyone using this.
 */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
  .transform((value) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  });

const expenseSchema = z.object({
  spentAt: dateOnly,
  amount,
  category: z.enum([
    "stock",
    "packaging",
    "shipping",
    "marketing",
    "salaries",
    "platform",
    "other",
  ]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function saveExpenseAction(
  id: string | null,
  input: unknown,
): Promise<FinanceActionResult> {
  const session = await requireRole("admin");
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the expense details." };
  }
  const { spentAt, amount: value, category, note } = parsed.data;

  const data = {
    spentAt,
    amount: value.toFixed(2),
    category,
    note: note || null,
  };

  if (id) {
    // recordedById is NOT reassigned on edit — it records who first entered the
    // expense, and rewriting it on every correction would erase that.
    await prisma.expense.update({ where: { id }, data });
  } else {
    await prisma.expense.create({
      data: { ...data, recordedById: session.user?.id ?? null },
    });
  }

  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<FinanceActionResult> {
  await requireRole("admin");
  await prisma.expense.delete({ where: { id } });
  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

const investorSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(100),
  email: z.string().trim().email("That email does not look right.").optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  /**
   * Capped at 100 individually, but the SUM across partners is deliberately not
   * validated. Getting from 50/50 to 40/30/30 means passing through a moment
   * where the total is not 100, and refusing the first edit would make the
   * change impossible to enter. The finance page flags an unbalanced total
   * instead — see ProfitSplit.sharesUnbalanced.
   */
  profitShare: z.number().min(0).max(100),
  isActive: z.boolean(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function saveInvestorAction(
  id: string | null,
  input: unknown,
): Promise<FinanceActionResult> {
  await requireRole("admin");
  const parsed = investorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the partner details." };
  }
  const { name, email, phone, profitShare, isActive, note } = parsed.data;

  const data = {
    name,
    email: email || null,
    phone: phone || null,
    profitShare: profitShare.toFixed(2),
    isActive,
    note: note || null,
  };

  if (id) {
    await prisma.investor.update({ where: { id }, data });
  } else {
    await prisma.investor.create({ data });
  }

  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

/**
 * Removes a partner and, by cascade, their whole contribution history.
 *
 * ⚠️  Refuses while they still have contributions recorded. Deleting those
 * would change the totals of every past period, so the honest move is to mark
 * the partner inactive instead — which stops them taking a cut of new periods
 * while leaving history intact. Only a partner added by mistake, who never put
 * anything in, can actually be deleted.
 */
export async function deleteInvestorAction(id: string): Promise<FinanceActionResult> {
  await requireRole("admin");

  const contributions = await prisma.investment.count({ where: { investorId: id } });
  if (contributions > 0) {
    return {
      ok: false,
      error:
        "This partner has contributions recorded. Mark them inactive instead — deleting them would change every past period.",
    };
  }

  await prisma.investor.delete({ where: { id } });
  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

const investmentSchema = z.object({
  investorId: z.string().min(1, "Choose a partner."),
  amount,
  investedAt: dateOnly,
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function addInvestmentAction(input: unknown): Promise<FinanceActionResult> {
  await requireRole("admin");
  const parsed = investmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the contribution." };
  }
  const { investorId, amount: value, investedAt, note } = parsed.data;

  await prisma.investment.create({
    data: {
      investorId,
      amount: value.toFixed(2),
      investedAt,
      note: note || null,
    },
  });

  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

export async function deleteInvestmentAction(id: string): Promise<FinanceActionResult> {
  await requireRole("admin");
  await prisma.investment.delete({ where: { id } });
  revalidatePath(FINANCE_PATH);
  return { ok: true };
}
