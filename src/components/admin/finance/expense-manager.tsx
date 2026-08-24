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
import { SortableHeaderButton } from "@/components/admin/sortable-header-button";
import { useTableSort, type SortValue } from "@/components/admin/use-table-sort";

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
 * How each sortable column reads its value.
 *
 * Module-level so the object identity is stable — useTableSort memoises on it,
 * and rebuilding it inside the component would re-sort on every render.
 *
 * The date is parsed to a timestamp rather than compared as a string: the value
 * arrives as an ISO string here, but "compares correctly as text" is a property
 * of that exact format, not something the column should depend on.
 */
const EXPENSE_COLUMNS: Record<string, (row: ExpenseRow) => SortValue> = {
  date: (e) => Date.parse(e.spentAt),
  category: (e) => e.category,
  note: (e) => e.note,
  recordedBy: (e) => e.recordedBy,
  amount: (e) => e.amount,
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

  // Newest first, matching the order the server sends and the order a batch of
  // receipts is entered in.
  const {
    rows: sortedExpenses,
    sort,
    dir,
    toggle,
  } = useTableSort({
    rows: expenses,
    columns: EXPENSE_COLUMNS,
    initialColumn: "date",
    initialDir: "desc",
  });

  // From the prop, not the sorted copy — reordering rows must not be able to
  // change the total, and reading the source array is what guarantees that.
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
                  {(
                    [
                      ["date", "Date", ""],
                      ["category", "Category", ""],
                      ["note", "Note", ""],
                      ["recordedBy", "Entered by", ""],
                      ["amount", "Amount", "text-right"],
                    ] as const
                  ).map(([column, label, className]) => (
                    <SortableHeaderButton
                      key={column}
                      column={column}
                      label={label}
                      currentSort={sort}
                      currentDir={dir}
                      onToggle={toggle}
                      className={className}
                    />
                  ))}
                  {/* The delete button's column — no data, nothing to sort. */}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedExpenses.map((expense) => (
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
