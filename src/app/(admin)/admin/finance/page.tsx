import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentRole } from "@/server/auth/require-role";
import {
  costCoverage,
  expensesByCategory,
  getFinanceSummary,
  getProfitSplit,
  listExpenses,
  listInvestments,
  monthPeriod,
} from "@/server/admin/finance";
import { formatINR } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpenseManager } from "@/components/admin/finance/expense-manager";
import { InvestorManager } from "@/components/admin/finance/investor-manager";
import { MonthPicker } from "@/components/admin/finance/month-picker";
import { SortableHeader } from "@/components/admin/sortable-header";
import { sortRows, type SortValue } from "@/lib/sort-rows";

/**
 * How each column of the partner split reads its value.
 *
 * Sorted in memory rather than in the database because the rows are COMPUTED —
 * `periodProfit` and `contributedShare` are derived from the month's figures
 * and the share percentages, and neither exists as a column to order by.
 */
const SPLIT_COLUMNS: Record<string, (row: SplitRow) => SortValue> = {
  partner: (i) => i.name,
  invested: (i) => i.contributed,
  capital: (i) => i.contributedShare,
  share: (i) => i.profitShare,
  // Inactive partners show "—" rather than a figure, so they have no value to
  // rank and fall to the bottom either way — see sortRows.
  period: (i) => (i.isActive ? i.periodProfit : null),
};

type SplitRow = {
  id: string;
  name: string;
  isActive: boolean;
  contributed: number;
  contributedShare: number;
  profitShare: number;
  periodProfit: number;
};

/**
 * The partners' books, one calendar month at a time.
 *
 * ── Admin only, three times over ─────────────────────────────────────────────
 * proxy.ts gates /admin optimistically, AdminGate in the layout is the
 * authoritative page-level check, and every reader in server/admin/finance.ts
 * re-checks on its own. The redirect below is therefore belt-and-braces rather
 * than the thing standing between an editor and these figures — editors cannot
 * reach /admin at all. It stays because a route can be moved out from under a
 * layout by accident, and this is not data to lose that way.
 *
 * ── Why a month, not "last 30 days" ──────────────────────────────────────────
 * Partners settle by month. A rolling window means two people asking on
 * different days get different answers for the same January, which is exactly
 * the argument this screen exists to prevent.
 */
export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; sort?: string; dir?: string }>;
}) {
  // getCurrentRole(), not the token: these are the most sensitive figures in
  // the application, and a role revoked an hour ago must close this page now
  // rather than whenever the session happens to expire. See require-role.ts.
  if ((await getCurrentRole()) !== "admin") redirect("/admin");

  const sp = await searchParams;
  const { m } = sp;
  const now = new Date();
  // `YYYY-MM`, falling back to the current month for anything unparseable.
  const parsed = /^(\d{4})-(\d{2})$/.exec(m ?? "");
  const year = parsed ? Number(parsed[1]) : now.getFullYear();
  const monthIndex = parsed ? Number(parsed[2]) - 1 : now.getMonth();
  const period = monthPeriod(year, monthIndex);

  const [summary, split, expenses, byCategory, investments, coverage] = await Promise.all([
    getFinanceSummary(period),
    getProfitSplit(period),
    listExpenses(period),
    expensesByCategory(period),
    listInvestments(),
    costCoverage(),
  ]);

  const monthLabel = period.from.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  // Partners read by name unless asked otherwise — a roster, not a ranking.
  const currentSort = sp.sort && sp.sort in SPLIT_COLUMNS ? sp.sort : "partner";
  const currentDir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const splitRows = sortRows(split.investors, SPLIT_COLUMNS[currentSort], currentDir);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Finance"
        description="Revenue, costs and each partner's share, by month. A ledger for the people running this — not books of account."
        actions={
          <MonthPicker year={year} monthIndex={monthIndex} sort={sp.sort} dir={sp.dir} />
        }
      />

      {/* ── The caveat comes FIRST ──────────────────────────────────────────
          Not buried under the figures it undermines. Every margin number on
          this page is an over-estimate while products are missing a cost
          price, and the person reading it needs to know that before they read
          it, not after. */}
      {coverage.missing > 0 && (
        <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">
            {coverage.missing} of {coverage.total} active products have no cost price.
          </p>
          <p className="mt-1">
            Anything sold without one is left out of cost of goods rather than counted as free, so
            gross and net profit below are higher than the truth. Fill them in on each{" "}
            <Link href="/admin/products" className="underline underline-offset-4">
              product
            </Link>{" "}
            or upload them in bulk with the CSV import, which now takes a{" "}
            <code className="text-xs">costPrice</code> column.
          </p>
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">{monthLabel}</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Product revenue" value={summary.productRevenue} hint={`${summary.orderCount} paid orders`} />
          <Figure label="Cost of goods" value={-summary.costOfGoods} hint={summary.linesMissingCost > 0 ? `${summary.linesMissingCost} lines missing cost` : "from per-sale snapshots"} />
          <Figure label="Expenses" value={-summary.expenses} hint="excludes per-product cost" />
          <Figure label="Net profit" value={summary.netProfit} hint="revenue − refunds − goods − expenses" emphasis />
        </div>

        {/* Shipping and refunds sit apart from the four figures above, because
            neither is revenue and putting them in the same row would imply
            they are. */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Aside
            label="Shipping collected"
            value={summary.shippingCollected}
            note="Collected for the courier, not revenue. Reconcile against the shipping expense category."
          />
          <Aside label="Refunds paid out" value={summary.refunded} note="Counted in the month the money left, not the month of the order." />
          <Aside label="Gross profit" value={summary.grossProfit} note="Revenue less refunds and cost of goods, before expenses." />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-medium">Each partner&apos;s share of {monthLabel}</h2>

        {split.investors.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No partners recorded yet. Add one below to start splitting the result.
            </CardContent>
          </Card>
        ) : (
          <>
            {split.sharesUnbalanced && (
              <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                Active partners&apos; shares add up to {split.sharesTotal.toFixed(2)}%, not 100%. The
                figures below are calculated from the percentages as they stand, so they will not
                sum to the net profit until this is corrected.
              </div>
            )}

            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(
                        [
                          ["partner", "Partner", ""],
                          ["invested", "Invested", ""],
                          ["capital", "Of all capital", ""],
                          ["share", "Profit share", ""],
                          ["period", monthLabel, "text-right"],
                        ] as const
                      ).map(([column, label, className]) => (
                        <SortableHeader
                          key={column}
                          basePath="/admin/finance"
                          column={column}
                          label={label}
                          currentSort={currentSort}
                          currentDir={currentDir}
                          params={sp}
                          className={className}
                        />
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {splitRows.map((investor) => (
                      <TableRow key={investor.id}>
                        <TableCell>
                          <span className={investor.isActive ? "" : "text-muted-foreground"}>
                            {investor.name}
                          </span>
                          {!investor.isActive && (
                            <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                          )}
                        </TableCell>
                        <TableCell>{formatINR(investor.contributed)}</TableCell>
                        {/* Shown beside the profit share precisely so the two can
                            be compared — they differ on purpose when a stake
                            reflects effort rather than cash. */}
                        <TableCell className="text-muted-foreground">
                          {investor.contributedShare.toFixed(1)}%
                        </TableCell>
                        <TableCell>{investor.profitShare.toFixed(2)}%</TableCell>
                        <TableCell className="text-right font-medium">
                          {investor.isActive ? formatINR(investor.periodProfit) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-medium">Total</TableCell>
                      <TableCell className="font-medium">
                        {formatINR(split.totalContributed)}
                      </TableCell>
                      <TableCell />
                      <TableCell className="font-medium">{split.sharesTotal.toFixed(2)}%</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatINR(split.netProfit)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <InvestorManager
        investors={split.investors.map((i) => ({
          id: i.id,
          name: i.name,
          email: i.email,
          phone: i.phone,
          profitShare: i.profitShare,
          isActive: i.isActive,
          note: i.note,
          contributed: i.contributed,
        }))}
        investments={investments.map((i) => ({
          id: i.id,
          investorId: i.investorId,
          investorName: i.investor.name,
          amount: Number(i.amount.toString()),
          investedAt: i.investedAt.toISOString(),
          note: i.note,
        }))}
      />

      <section className="space-y-4">
        <h2 className="text-base font-medium">Expenses — {monthLabel}</h2>

        {byCategory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">By category</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {byCategory.map((row) => (
                <span key={row.category}>
                  <span className="capitalize text-muted-foreground">{row.category}</span>{" "}
                  <span className="font-medium">{formatINR(row.total)}</span>
                </span>
              ))}
            </CardContent>
          </Card>
        )}

        <ExpenseManager
          expenses={expenses.map((e) => ({
            id: e.id,
            spentAt: e.spentAt.toISOString(),
            amount: Number(e.amount.toString()),
            category: e.category,
            note: e.note,
            recordedBy: e.recordedBy?.name ?? e.recordedBy?.email ?? null,
          }))}
          defaultMonth={`${year}-${String(monthIndex + 1).padStart(2, "0")}`}
        />
      </section>
    </div>
  );
}

/**
 * One headline figure.
 *
 * Negative values are shown as negative rather than dressed up as "spend", so a
 * column of numbers can be read down and add up to the total beside it.
 */
function Figure({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: number;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-xl font-semibold ${
            emphasis && value < 0 ? "text-destructive" : ""
          }`}
        >
          {formatINR(value)}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** A figure that is context rather than a component of profit. */
function Aside({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-medium">{formatINR(value)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
