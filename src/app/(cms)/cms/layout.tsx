import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/server/auth/auth";
import { getCurrentRole } from "@/server/auth/require-role";
import { prisma } from "@/server/db";
import { DashboardShell, type NavGroup } from "@/components/layout/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Content types are listed in this order when present; anything not named here
 * is appended alphabetically. ContentType has no sortOrder column, and ordering
 * by name would bury Homepage below Announcements — but a new type must still
 * appear on its own, which a hardcoded menu could not do. Adding heroSlide
 * previously left it with no menu entry at all.
 */
const PREFERRED_ORDER = [
  "homepage",
  "heroSlide",
  "page",
  "blog",
  "collection",
  "announcement",
  "banner",
];

/**
 * As with /admin: the gate and the nav query sit behind Suspense, because the
 * whole Studio is per-user and uncacheable. The boundary declares that rather
 * than letting it leak out into the rest of the app.
 */
export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<CmsShellSkeleton />}>
      <CmsGate>{children}</CmsGate>
    </Suspense>
  );
}

async function CmsGate({ children }: { children: React.ReactNode }) {
  // Role from the database, not from session.user.role — the token's copy is
  // written once at sign-in, so a revoked editor would keep rendering this
  // shell until it expired. See the note in require-role.ts.
  const [session, role] = await Promise.all([auth(), getCurrentRole()]);
  if (!session?.user || !role || (role !== "admin" && role !== "editor")) {
    redirect("/login?redirect=/cms");
  }

  const contentTypes = await prisma.contentType.findMany({
    select: { name: true, label: true },
  });

  const rank = (name: string) => {
    const index = PREFERRED_ORDER.indexOf(name);
    return index === -1 ? PREFERRED_ORDER.length : index;
  };

  const sorted = [...contentTypes].sort(
    (a, b) => rank(a.name) - rank(b.name) || a.label.localeCompare(b.label)
  );

  /**
   * Content types get their own group, so the list stays legible as types are
   * added — which is the whole reason this menu is queried rather than
   * hardcoded. The icon key is the type's own name, and dashboard-nav falls
   * back to a generic mark for any it does not recognise, so a new type is
   * never iconless-and-broken.
   */
  const groups: NavGroup[] = [
    { items: [{ href: "/cms", label: "Dashboard", icon: "dashboard" }] },
    {
      label: "Content",
      items: sorted.map((type) => ({
        href: `/cms/content/${type.name}`,
        label: type.label,
        icon: type.name,
      })),
    },
    {
      label: "Library",
      items: [{ href: "/cms/media", label: "Media", icon: "media" }],
    },
  ];

  return (
    <DashboardShell
      title="Studio"
      groups={groups}
      roleLabel={role}
      // From the same query as the sidebar, so a renamed content type changes
      // in both places at once. These used to be hardcoded in the breadcrumb
      // component and had already drifted — "Blog" there, "Journal" here.
      breadcrumbLabels={Object.fromEntries(sorted.map((t) => [t.name, t.label]))}
      user={{ name: session.user?.name, email: session.user?.email }}
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      {children}
    </DashboardShell>
  );
}

/** Matches the real shell's geometry, so nothing jumps when the gate resolves. */
function CmsShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <Skeleton className="hidden h-screen w-60 shrink-0 lg:block" />
      <div className="flex-1">
        <div className="flex h-14 items-center border-b px-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
