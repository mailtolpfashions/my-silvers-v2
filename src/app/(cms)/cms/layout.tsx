import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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
  const session = await auth();
  const role = session?.user?.role;
  if (!role || (role !== "admin" && role !== "editor")) {
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

  const navItems = [
    { href: "/cms", label: "Dashboard" },
    ...sorted.map((type) => ({
      href: `/cms/content/${type.name}`,
      label: type.label,
    })),
    { href: "/cms/media", label: "Media" },
  ];

  return (
    <DashboardShell title="Studio" navItems={navItems} roleLabel={role}>
      {children}
    </DashboardShell>
  );
}

function CmsShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <Skeleton className="hidden w-60 shrink-0 md:block" />
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
