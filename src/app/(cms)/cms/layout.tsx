import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const CMS_NAV = [
  { href: "/cms", label: "Dashboard" },
  { href: "/cms/content/homepage", label: "Homepage" },
  { href: "/cms/content/page", label: "Pages" },
  { href: "/cms/content/blog", label: "Blog" },
  { href: "/cms/content/collection", label: "Collections" },
  { href: "/cms/content/announcement", label: "Announcements" },
  { href: "/cms/content/banner", label: "Banners" },
  { href: "/cms/media", label: "Media" },
];

export default async function CmsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || (role !== "admin" && role !== "editor")) {
    redirect("/login?redirect=/cms");
  }

  return (
    <DashboardShell title="Studio" navItems={CMS_NAV} roleLabel={role}>
      {children}
    </DashboardShell>
  );
}
