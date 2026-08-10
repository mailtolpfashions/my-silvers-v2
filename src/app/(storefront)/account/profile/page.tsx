import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { ProfileForm } from "@/components/storefront/account/profile-form";

export const metadata = { title: "Your details" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/account/profile");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { title: true, name: true, email: true, phone: true, dateOfBirth: true },
  });
  if (!user) redirect("/login");

  return (
    <div className="container-checkout rhythm-transactional">
      <Link href="/account" className="text-sm text-muted-foreground underline">
        ← Back to account
      </Link>
      <h1 className="mb-6 mt-4 text-h1">Your details</h1>

      <ProfileForm
        initial={{
          title: user.title,
          name: user.name,
          email: user.email,
          phone: user.phone,
          // <input type="date"> needs a bare YYYY-MM-DD value.
          dateOfBirth: user.dateOfBirth
            ? user.dateOfBirth.toISOString().slice(0, 10)
            : null,
        }}
      />
    </div>
  );
}
