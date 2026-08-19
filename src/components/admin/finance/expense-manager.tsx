"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/format";
import { deleteExpenseAction, saveExpenseAction } from "@/actions/admin-finance-actions";

const CATEGORIES = [
  "stock",
  "packaging",
  "shipping",
  "marketing",
  "salaries",
  "platform",
  "other",
] as const;

export type ExpenseRow = {
  id: string;
  spentAt: string;
  amount: number;
  category: string;
  note: string | null;
  recordedBy: string | null;
};

/**
 * Add and remove expenses for the month on screen.
 *
 * ── Inline, not a dialog ─────────────────────────────────────────────────────
 * Entering expenses is a batch job — you sit down with a stack of receipts and
 * type in eight of them. A modal that has to be reopened per row turns that
 * into eight extra clicks, so the form stays on the page and clears itself for
 * the next one.
 *
 * The date defaults to the month being viewed rather than today, because the
 * person entering January's receipts in February wants January.
 */
export function ExpenseManager({
  expenses,
  defaultMonth,
}: {
  expenses: ExpenseRow[];
  /** `YYYY-MM` of the period on screen. */
  defaultMonth: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [spentAt, setSpentAt] = useState(`${defaultMonth}-01`);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [note, setNote] = useState("");

  function add() {
    startTransition(async () => {
      const result = await saveExpenseAction(null, {
        spentAt,
        amount: Number(amount),
        category,
        note,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Everything but the date, which almost always repeats across a batch.
      setAmount("");
      setNote("");
      toast.success("Expense recorded.");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteExpenseAction(id);
      if (!result.ok) toast.error(result.error);
      else toast.success("Expense removed.");
    });
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Card>
      <CardContent className="space-y-6 p-4">
        <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="expense-date">Date</Label>
            <Input
              id="expense-date"
              type="date"
              value={spentAt}
              onChange={(e) => setSpentAt(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Amount (₹)</Label>
            <Input
              id="expense-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 w-32"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-category">Category</Label>
            <div className="flex gap-2">
              <select
                id="expense-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm capitalize"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <Button onClick={add} disabled={isPending || !amount} className="h-9">
            Add
          </Button>
        </div>

        {expenses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing recorded for this month.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Entered by</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>
                      {new Date(expense.spentAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </TableCell>
                    <TableCell className="capitalize">{expense.category}</TableCell>
                    <TableCell className="text-muted-foreground">{expense.note ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{expense.recordedBy ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatINR(expense.amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove expense of ${formatINR(expense.amount)}`}
                        disabled={isPending}
                        onClick={() => remove(expense.id)}
                        className="size-8"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="font-medium">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatINR(total)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
