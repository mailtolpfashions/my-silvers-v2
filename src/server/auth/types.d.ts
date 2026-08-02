import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// `next-auth` re-exports Session/User/JWT from `@auth/core/*` rather than
// declaring them itself (`export type { Session } from "@auth/core/types"`),
// so augmenting "next-auth"/"next-auth/jwt" directly does not merge — it must
// target the module that actually declares the interface.
declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
