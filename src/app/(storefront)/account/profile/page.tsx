import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { ProfileForm } from "@/components/storefront/account/profile-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Your details" };

/**
 * Chrome prerenders, the form streams once the shopper's own details arrive.
 * Reading the session in the page body makes the whole route uncached under
 * cacheComponents, so even the back link waits on the database.
 */
export default function ProfilePage() {
  return (
    <div className="container-checkout rhythm-transactional">
      <Link href="/account" className="text-sm text-muted-foreground underline">
        ← Back to account
      </Link>
      <h1 className="mb-6 mt-4 text-h1">Your details</h1>

      <Suspense fallback={<ProfileSkeleton />}>
        <Profile />
      </Suspense>
    </div>
  );
}

async function Profile() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/account/profile");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { title: true, name: true, email: true, phone: true, dateOfBirth: true },
  });
  if (!user) redirect("/login");

  return (
    <ProfileForm
      initial={{
        title: user.title,
        name: user.name,
        email: user.email,
        phone: user.phone,
        // <input type="date"> needs a bare YYYY-MM-DD value.
        dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
      }}
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
