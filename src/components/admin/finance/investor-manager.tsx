"use client";

import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/format";
import {
  addInvestmentAction,
  deleteInvestmentAction,
  deleteInvestorAction,
  saveInvestorAction,
} from "@/actions/admin-finance-actions";

export type InvestorEntry = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  profitShare: number;
  isActive: boolean;
  note: string | null;
  contributed: number;
};

export type InvestmentEntry = {
  id: string;
  investorId: string;
  investorName: string;
  amount: number;
  investedAt: string;
  note: string | null;
};

/**
 * The partners and the money they have put in.
 *
 * ── Two things that look like one ────────────────────────────────────────────
 * A partner's PROFIT SHARE is set here by hand; their CONTRIBUTIONS are a
 * ledger of individual payments. They are deliberately not linked — see the
 * note on Investor.profitShare in schema.prisma. Keeping both editable in the
 * same place is what lets someone notice they have drifted apart and decide
 * whether that is intended.
 *
 * ── Editing shares is unguarded on purpose ───────────────────────────────────
 * Going from 50/50 to 40/30/30 passes through totals that are not 100. The
 * action does not refuse those, and the page above shows a warning while the
 * total is off, so the change can actually be entered.
 */
export function InvestorManager({
  investors,
  investments,
}: {
  investors: InvestorEntry[];
  investments: InvestmentEntry[];
}) {
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", profitShare: "" });
  /**
   * Which contribution is awaiting confirmation.
   *
   * ⚠️  Deleting one changes the capital totals every past period was split
   * against. It fired on the first click until now — while deleting a REVIEW,
   * which changes nothing financial, had a full explanatory confirmation. The
   * guard was on the wrong action.
   */
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [contribution, setContribution] = useState({
    investorId: investors[0]?.id ?? "",
    amount: "",
    investedAt: new Date().toISOString().slice(0, 10),
    note: "",
  });

  function run(work: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) toast.error(result.error ?? "That did not work.");
      else toast.success(success);
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-medium">Partners and capital</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add a partner</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="inv-name">Name</Label>
            <Input
              id="inv-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Email (optional)</Label>
            <Input
              id="inv-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-share">Share (%)</Label>
            <Input
              id="inv-share"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={draft.profitShare}
              onChange={(e) => setDraft({ ...draft, profitShare: e.target.value })}
              className="h-9 w-24"
            />
          </div>
          <Button
            className="h-9"
            disabled={isPending || draft.name.trim().length < 2}
            onClick={() =>
              run(async () => {
                const result = await saveInvestorAction(null, {
                  name: draft.name,
                  email: draft.email,
                  phone: draft.phone,
                  profitShare: Number(draft.profitShare || 0),
                  isActive: true,
                  note: "",
                });
                if (result.ok) setDraft({ name: "", email: "", phone: "", profitShare: "" });
                return result;
              }, "Partner added.")
            }
          >
            Add
          </Button>
        </CardContent>
      </Card>

      {investors.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Invested</TableHead>
                  <TableHead>Share (%)</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((investor) => (
                  <InvestorRowEditor
                    key={investor.id}
                    investor={investor}
                    disabled={isPending}
                    onSave={(patch) =>
                      run(
                        () =>
                          saveInvestorAction(investor.id, {
                            name: patch.name,
                            email: investor.email ?? "",
                            phone: investor.phone ?? "",
                            profitShare: patch.profitShare,
                            isActive: patch.isActive,
                            note: investor.note ?? "",
                          }),
                        "Partner updated.",
                      )
                    }
                    onDelete={() =>
                      run(() => deleteInvestorAction(investor.id), "Partner removed.")
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {investors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Record a contribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="con-who">Partner</Label>
                <select
                  id="con-who"
                  value={contribution.investorId}
                  onChange={(e) => setContribution({ ...contribution, investorId: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {investors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="con-amount">Amount (₹)</Label>
                <Input
                  id="con-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={contribution.amount}
                  onChange={(e) => setContribution({ ...contribution, amount: e.target.value })}
                  className="h-9 w-32"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="con-date">Date</Label>
                <Input
                  id="con-date"
                  type="date"
                  value={contribution.investedAt}
                  onChange={(e) => setContribution({ ...contribution, investedAt: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="con-note">Note (optional)</Label>
                <Input
                  id="con-note"
                  value={contribution.note}
                  onChange={(e) => setContribution({ ...contribution, note: e.target.value })}
                  className="h-9"
                />
              </div>
              <Button
                className="h-9"
                disabled={isPending || !contribution.amount || !contribution.investorId}
                onClick={() =>
                  run(async () => {
                    const result = await addInvestmentAction({
                      investorId: contribution.investorId,
                      amount: Number(contribution.amount),
                      investedAt: contribution.investedAt,
                      note: contribution.note,
                    });
                    if (result.ok) setContribution({ ...contribution, amount: "", note: "" });
                    return result;
                  }, "Contribution recorded.")
                }
              >
                Record
              </Button>
            </div>

            {investments.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {investments.map((entry) => (
                      <Fragment key={entry.id}>
                        <TableRow>
                        <TableCell>
                          {new Date(entry.investedAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>{entry.investorName}</TableCell>
                        <TableCell className="text-muted-foreground">{entry.note ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatINR(entry.amount)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${entry.investorName}'s contribution of ${formatINR(entry.amount)}`}
                            disabled={isPending}
                            onClick={() => setConfirmingDelete(entry.id)}
                            className="size-8"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                        {confirmingDelete === entry.id && (
                          <TableRow className="bg-muted/40">
                            <TableCell colSpan={5}>
                              <p className="text-sm">
                                Delete {entry.investorName}&apos;s contribution of{" "}
                                <strong>{formatINR(entry.amount)}</strong>? Their share of all
                                capital changes, and so does every past period this was counted in.
                              </p>
                              <div className="mt-3 flex gap-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() => {
                                    run(
                                      () => deleteInvestmentAction(entry.id),
                                      "Contribution removed.",
                                    );
                                    setConfirmingDelete(null);
                                  }}
                                >
                                  Delete
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmingDelete(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/**
 * One editable partner row.
 *
 * Local state per row rather than one form for the table: editing a share is a
 * single-field change and should not require saving four other people's rows
 * alongside it.
 */
function InvestorRowEditor({
  investor,
  disabled,
  onSave,
  onDelete,
}: {
  investor: InvestorEntry;
  disabled: boolean;
  onSave: (patch: { name: string; profitShare: number; isActive: boolean }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(investor.name);
  const [share, setShare] = useState(String(investor.profitShare));
  const [isActive, setIsActive] = useState(investor.isActive);
  /**
   * Two-step, even though the server already refuses to delete a partner who
   * has contributions — it returns "mark them inactive instead". This covers
   * the case the server allows: someone added by mistake who never put anything
   * in. Low stakes, but it is still a person's record and one stray click.
   */
  const [confirming, setConfirming] = useState(false);

  const dirty =
    name !== investor.name ||
    Number(share) !== investor.profitShare ||
    isActive !== investor.isActive;

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-40"
          aria-label={`Name for ${investor.name}`}
        />
      </TableCell>
      <TableCell className="text-muted-foreground">{investor.email ?? investor.phone ?? "—"}</TableCell>
      <TableCell>{formatINR(investor.contributed)}</TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={share}
          onChange={(e) => setShare(e.target.value)}
          className="h-8 w-24"
          aria-label={`Profit share for ${investor.name}`}
        />
      </TableCell>
      <TableCell>
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          aria-label={`${investor.name} is an active partner`}
          className="size-4"
        />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          {dirty && (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onSave({ name, profitShare: Number(share || 0), isActive })}
              className="h-8"
            >
              Save
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${investor.name}`}
            disabled={disabled}
            onClick={() => setConfirming(true)}
            className="size-8"
          >
            <Trash2 className="size-4" />
          </Button>
          {confirming && (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Remove?</span>
              <Button
                variant="destructive"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  onDelete();
                  setConfirming(false);
                }}
                className="h-7"
              >
                Yes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirming(false)}
                className="h-7"
              >
                No
              </Button>
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
