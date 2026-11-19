import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireRoleForPage } from "@/server/auth/require-role";
import { MAX_ADDRESSES } from "@/lib/validation/account";
import { formatINR } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { viewerIsOwner } from "@/components/admin/owner-only";
import { CustomerEditor } from "@/components/admin/customer-editor";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { deleteCustomerAction, setCustomerBlockedAction } from "@/actions/admin-customer-actions";
import { paymentStatusLabel } from "@/lib/payment-labels";
import { scanActivity } from "@/lib/courier-text";

/** Blocking, like every other admin route — see admin/customers/page.tsx. */
export const instant = false;

/**
 * One customer: who they are, where they ship to, what they've bought — and,
 * for the owner, edit / block / delete. Admins see it read-only.
 */
export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRoleForPage("admin");
  const { id } = await params;

  const [customer, owner] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: [{ isDefault: "desc" }, { id: "asc" }] },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            totalAmount: true,
            orderStatus: true,
            paymentStatus: true,
            paymentMethod: true,
          },
        },
        _count: { select: { orders: true } },
      },
    }),
    viewerIsOwner(),
  ]);
  if (!customer || customer.role !== "customer") notFound();

  const erased = customer.email.endsWith("@deleted.invalid");
  const blocked = Boolean(customer.blockedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name ?? customer.email}
        description={`Customer since ${customer.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`}
        backHref="/admin/customers"
        backLabel="Customers"
      />

      {(blocked || erased) && (
        <p className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm">
          {erased
            ? "This customer's personal details were erased. Their orders are kept for the tax records."
            : `Blocked on ${customer.blockedAt!.toLocaleDateString("en-IN", { dateStyle: "medium" })} — can't sign in or place orders.`}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              {owner && !erased ? (
                <CustomerEditor
                  userId={customer.id}
                  name={customer.name ?? ""}
                  phone={customer.phone ?? ""}
                  addresses={customer.addresses}
                  maxAddresses={MAX_ADDRESSES}
                />
              ) : (
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="font-medium">{customer.name ?? "—"}</p>
                    <p className="text-muted-foreground">{customer.phone ?? "No mobile saved"}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">Saved addresses</p>
                    {customer.addresses.length === 0 ? (
                      <p className="text-muted-foreground">None.</p>
                    ) : (
                      customer.addresses.map((a) => (
                        <p key={a.id} className="text-muted-foreground">
                          {a.fullName}, {a.addressLine1}, {a.city}, {a.state} {a.pincode} · {a.phone}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Orders ({customer._count.orders})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {customer.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {customer.orders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                        {o.orderNumber}
                      </Link>
                      <span className="text-muted-foreground">
                        {o.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                      </span>
                      <span className="text-muted-foreground">
                        {scanActivity(o.orderStatus)} · {o.paymentMethod === "cod" ? "COD" : paymentStatusLabel(o.paymentStatus)}
                      </span>
                      <span className="tabular-nums">{formatINR(o.totalAmount.toString())}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {erased ? (
                <p className="text-muted-foreground">Erased</p>
              ) : (
                <a href={`mailto:${customer.email}`} className="underline">
                  {customer.email}
                </a>
              )}
              <p className="text-muted-foreground">
                {customer.emailVerified ? "Email confirmed" : "Email not confirmed"}
              </p>
            </CardContent>
          </Card>

          {owner && !erased && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Owner tools</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <p className="text-muted-foreground">
                    {blocked
                      ? "Let them sign in and order again."
                      : "Stop this person signing in or placing orders. Nothing is deleted."}
                  </p>
                  <ConfirmAction
                    action={setCustomerBlockedAction.bind(null, customer.id, !blocked)}
                    label={blocked ? "Unblock customer" : "Block customer"}
                    title={blocked ? "Unblock this customer?" : "Block this customer?"}
                    description={
                      blocked
                        ? "They'll be able to sign in and order again straight away."
                        : "They won't be able to sign in or place an order — including as a guest with this email. You can unblock them any time."
                    }
                    confirmLabel={blocked ? "Unblock" : "Block"}
                    destructive={!blocked}
                    success={blocked ? "Customer unblocked." : "Customer blocked."}
                  />
                </div>
                <div className="space-y-2 border-t pt-4">
                  <p className="text-muted-foreground">
                    {customer._count.orders === 0
                      ? "Remove the account completely."
                      : "Erase their name, email, phone, addresses, cart, wishlist and reviews. Their orders stay, for the tax records."}
                  </p>
                  <ConfirmAction
                    action={deleteCustomerAction.bind(null, customer.id)}
                    label="Delete customer"
                    title={`Delete ${customer.name ?? customer.email}?`}
                    description={
                      customer._count.orders === 0
                        ? "The account and everything in it is removed. This can't be undone."
                        : `Their personal details are erased and the account is closed. Their ${customer._count.orders} order${customer._count.orders === 1 ? "" : "s"} stay on record as "Deleted customer". This can't be undone.`
                    }
                    confirmLabel="Delete customer"
                    typeToConfirm="delete"
                    success="Customer deleted."
                    redirectTo="/admin/customers"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
