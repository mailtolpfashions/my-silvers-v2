"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addStaffAction, setStaffRoleAction } from "@/actions/admin-staff-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type StaffRow = {
  id: string;
  name: string | null;
  email: string;
  role: "superadmin" | "admin" | "editor";
  lastActive: string | null;
  isYou: boolean;
};

const LABEL: Record<StaffRow["role"], string> = {
  superadmin: "Owner",
  admin: "Admin",
  editor: "Editor",
};

/** What each role means, shown beside the picker so nobody has to guess. */
const MEANS: Record<StaffRow["role"], string> = {
  superadmin: "Everything, including staff, money, settings, refunds and deletes.",
  admin: "Products, orders, shipping, customers and reviews. No money, settings, refunds or deletes.",
  editor: "Website content (CMS) only.",
};

const selectClass =
  "h-9 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Pending =
  | { kind: "remove"; row: StaffRow }
  | { kind: "owner"; row: StaffRow }
  | null;

export function StaffManager({ staff }: { staff: StaffRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "editor">("admin");
  const [pending, setPending] = useState<Pending>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addStaffAction(email, newRole);
      if (result.ok) {
        toast.success(result.message ?? "Added.");
        setEmail("");
      } else {
        toast.error(result.error);
      }
    });
  }

  function setRole(row: StaffRow, role: StaffRow["role"] | "customer") {
    startTransition(async () => {
      const result = await setStaffRoleAction(row.id, role);
      if (result.ok) {
        toast.success(
          role === "customer"
            ? `${row.email} is no longer staff.`
            : `${row.email} is now ${LABEL[role]}.`
        );
      } else {
        toast.error(result.error);
      }
      setPending(null);
    });
  }

  return (
    <div className="space-y-8">
      <form onSubmit={add} className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Add a member of staff</h2>
        <p className="text-sm text-muted-foreground">
          They must first create an account on the shop with this email. You never need to
          know their password.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="staff-email">Their email</Label>
            <Input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-role">Role</Label>
            <select
              id="staff-role"
              className={selectClass}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "admin" | "editor")}
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
            </select>
          </div>
          <Button type="submit" disabled={isPending || !email}>
            {isPending ? "Adding…" : "Add"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{MEANS[newRole]}</p>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-sm font-medium">
                  {row.name ?? "—"}
                  {row.isYou && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                </TableCell>
                <TableCell className="text-sm">{row.email}</TableCell>
                <TableCell className="text-sm">
                  {row.isYou ? (
                    LABEL[row.role]
                  ) : (
                    <select
                      aria-label={`Role for ${row.email}`}
                      className={selectClass}
                      value={row.role}
                      disabled={isPending}
                      onChange={(e) => {
                        const role = e.target.value as StaffRow["role"];
                        // Handing over ownership is the one change that can't
                        // be quietly undone by the person who made it.
                        if (role === "superadmin") setPending({ kind: "owner", row });
                        else setRole(row, role);
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="superadmin">Owner</option>
                    </select>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.lastActive
                    ? new Date(row.lastActive).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {!row.isYou && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => setPending({ kind: "remove", row })}
                    >
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={pending?.kind === "remove"}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Remove ${pending?.row.email ?? ""} from staff?`}
        description={
          <>
            They keep their shop account and orders, but lose access to the admin and CMS on
            their very next click.
          </>
        }
        confirmLabel="Remove from staff"
        disabled={isPending}
        onConfirm={() => pending && setRole(pending.row, "customer")}
      />
      <ConfirmDialog
        open={pending?.kind === "owner"}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Make ${pending?.row.email ?? ""} an owner?`}
        description={
          <>
            Owners can do everything you can — including changing <strong>your</strong> role,
            seeing the partners&apos; money and issuing refunds.
          </>
        }
        confirmLabel="Make owner"
        typeToConfirm="owner"
        disabled={isPending}
        onConfirm={() => pending && setRole(pending.row, "superadmin")}
      />
    </div>
  );
}
