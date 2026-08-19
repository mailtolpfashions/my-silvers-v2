import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/admin/copy-button";

/**
 * Newsletter subscribers.
 *
 * They have been collected since launch with no way to see them, which meant
 * the list existed and was unusable. This is deliberately a small screen: read
 * and copy, no editing. Unsubscribing is the subscriber's decision and happens
 * through their own link — an admin toggle here would be a way to opt someone
 * back IN, which is not a button worth building.
 */
export default async function AdminNewsletterPage() {
  await requireRole("admin");

  const [subscribers, activeCount] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      orderBy: { subscribedAt: "desc" },
      select: { id: true, email: true, subscribedAt: true, active: true },
    }),
    prisma.newsletterSubscriber.count({ where: { active: true } }),
  ]);

  // Active only. Pasting unsubscribed addresses into a mail tool is how a shop
  // ends up mailing people who asked it not to.
  const activeEmails = subscribers
    .filter((s) => s.active)
    .map((s) => s.email)
    .join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Newsletter"
        description="Everyone who has signed up. Copy the active list into whatever you send with."
        actions={
          activeCount > 0 ? (
            <CopyButton value={activeEmails} label={`Copy ${activeCount} active`} />
          ) : undefined
        }
      />

      {subscribers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nobody has subscribed yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Subscribed</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <a
                        href={`mailto:${subscriber.email}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {subscriber.email}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {subscriber.subscribedAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {subscriber.active ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">
                          Active
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">Unsubscribed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
