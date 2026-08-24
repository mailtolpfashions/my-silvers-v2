import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { auth } from "@/server/auth/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Skeleton } from "@/components/ui/skeleton";

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

/**
 * Only the greeting is per-shopper; the link list is the same for everyone.
 *
 * So the session read sits behind its own <Suspense> and the rest of the page
 * prerenders. Reading it in the page body instead — which is what this did —
 * makes the whole route uncached under cacheComponents, so a static list of
 * four links waits on a database round trip before anything paints.
 */
export default function AccountPage() {
  return (
    <div className="container-checkout rhythm-transactional">
      <p className="label-eyebrow mb-3">Account</p>

      <Suspense fallback={<GreetingSkeleton />}>
        <Greeting />
      </Suspense>

      <ul className="mt-10 border-t">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="group flex items-center justify-between gap-6 border-b py-5 transition-colors hover:text-black"
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

async function Greeting() {
  const session = await auth();
  if (!session?.user) redirect("/login?redirect=/account");

  return (
    <>
      <h1 className="text-h1">
        {/* The name when we have one — a shop should greet a customer by name,
            not by primary key. Falls back to the email, never to the role. */}
        {session.user.name ? `Hello, ${session.user.name.split(" ")[0]}` : "Your account"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">{session.user.email}</p>
    </>
  );
}

/** Holds the heading's height so the links below do not jump when it lands. */
function GreetingSkeleton() {
  return (
    <>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-3 h-4 w-48" />
    </>
  );
}
