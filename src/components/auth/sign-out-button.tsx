import { signOut } from "@/server/auth/auth";
import { Button } from "@/components/ui/button";

/**
 * Sign out via a Server Action — a POST, not a link. A GET-triggered sign-out
 * can be fired by any third-party page embedding <img src="/api/auth/signout">,
 * which is CSRF-able logout.
 */
export function SignOutButton({
  redirectTo = "/",
  variant = "outline",
  className,
  label = "Sign out",
}: {
  redirectTo?: string;
  /** e.g. "Sign out and switch account". */
  label?: string;
  variant?: "outline" | "ghost" | "default";
  className?: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo });
      }}
    >
      <Button type="submit" variant={variant} size="sm" className={className}>
        {label}
      </Button>
    </form>
  );
}
