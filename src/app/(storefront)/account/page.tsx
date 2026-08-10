import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { auth } from "@/server/auth/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * The account hub.
 *
 * It was four underlined links in a stack, under a line reading
 * "Signed in as x@y.com (customer)" — the role in parentheses being a database
 * value shown to a shopper who has no use for it. This is a set of ruled rows
 * with a description each, which is what the rest of the site looks like.
 */
const LINKS: Array<{ href: string; label: string; description: string }> = [
  { href: "/account/orders", label: "Orders", description: "Track a delivery, or start a return" },
  { href: "/account/profile", label: "Your details", description: "Name, phone and date of birth" },
  { href: "/account/addresses", label: "Addresses", description: "Where we deliver your orders" },
  { href: "/wishlist", label: "Wishlist", description: "The pieces you've saved" },
];

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?redirect=/account");

  return (
    <div className="container-checkout rhythm-transactional">
      <p className="label-eyebrow mb-3">Account</p>
      <h1 className="text-h1">
        {/* The name when we have one — a shop should greet a customer by name,
            not by primary key. Falls back to the email, never to the role. */}
        {session.user.name ? `Hello, ${session.user.name.split(" ")[0]}` : "Your account"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">{session.user.email}</p>

      <ul className="mt-10 border-t">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="group flex items-center justify-between gap-6 border-b py-5 transition-colors hover:text-brass-text"
            >
              <span>
                <span className="block text-sm font-medium">{link.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {link.description}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10">
        <SignOutButton />
      </div>
    </div>
  );
}
