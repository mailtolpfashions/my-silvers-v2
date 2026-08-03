import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { DashboardShell } from "@/components/layout/dashboard-shell";

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

export default async function CmsLayout({ children }: { children: React.ReactNode }) {
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
