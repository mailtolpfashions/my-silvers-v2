import { getActiveCategories } from "@/server/products/search";
import { CategoryNavLinks } from "@/components/storefront/header/category-nav-links";
import type { MobileNavLink } from "@/components/storefront/header/mobile-nav";

/**
 * Builds the navigation link list once, on the server, and hands it to both the
 * desktop row and the mobile drawer. Identical for every visitor, so it stays
 * out of the account island and can be cached — it only changes when the
 * catalogue does.
 */
export async function buildNavLinks(): Promise<MobileNavLink[]> {
  // Categories come from the catalogue, managed in /admin/categories, so the
  // nav can't drift from what the shop actually sells.
  const categories = await getActiveCategories();

  return [
    { label: "All Jewellery", href: "/products", icon: "sparkles" },
    ...categories.map((category) => ({
      label: category.name,
      href: `/category/${category.slug}`,
      // Set per category in /admin/categories. Null renders label-only, so the
      // nav degrades cleanly until someone fills them in.
      icon: category.icon,
    })),
    { label: "Collections", href: "/collections", icon: "gem" },
    { label: "Journal", href: "/blog", icon: "book-open" },
  ];
}

/** The desktop category row. Hidden below lg, where the drawer takes over. */
export async function CategoryNav() {
  const links = await buildNavLinks();

  return (
    <nav aria-label="Categories" className="hidden border-t lg:block">
      <div className="container-page">
        <CategoryNavLinks links={links} />
      </div>
    </nav>
  );
}
