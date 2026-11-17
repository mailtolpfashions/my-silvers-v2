import { prisma } from "@/server/db";
import { auth } from "@/server/auth/auth";
import { PageHeader } from "@/components/layout/page-header";
import { OwnerOnlyNotice, viewerIsOwner } from "@/components/admin/owner-only";
import { StaffManager, type StaffRow } from "@/components/admin/staff-manager";

/** Blocking, like every other admin route — see admin/customers/page.tsx. */
export const instant = false;

export default async function AdminStaffPage() {
  if (!(await viewerIsOwner())) return <OwnerOnlyNotice area="Staff & roles" />;

  const [session, staff, lastSeen] = await Promise.all([
    auth(),
    prisma.user.findMany({
      where: { role: { in: ["superadmin", "admin", "editor"] } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "desc" }, { email: "asc" }],
    }),
    prisma.activityLog.groupBy({
      by: ["actorId"],
      where: { actorId: { not: null } },
      _max: { createdAt: true },
    }),
  ]);

  const last = new Map(lastSeen.map((r) => [r.actorId, r._max.createdAt]));
  // Owner first, then admins, then editors — the order of who can do most.
  const rank = { superadmin: 0, admin: 1, editor: 2 } as const;
  const rows: StaffRow[] = staff
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as StaffRow["role"],
      lastActive: last.get(u.id)?.toISOString() ?? null,
      isYou: u.id === session?.user?.id,
    }))
    .sort((a, b) => rank[a.role] - rank[b.role] || a.email.localeCompare(b.email));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & roles"
        description="Who can use the admin and the Studio, and what each person may do."
      />
      <StaffManager staff={rows} />
    </div>
  );
}
