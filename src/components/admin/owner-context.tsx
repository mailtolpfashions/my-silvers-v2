"use client";

import { createContext, useContext } from "react";

/**
 * Whether the person looking at the admin is the OWNER — so client components
 * deep in a table can hide the delete buttons without the flag being threaded
 * through every layer. Provided once, by AdminGate in admin/layout.tsx, from
 * the role the database holds.
 *
 * Presentation only. Every action behind a hidden button re-checks with
 * requireOwner(), so a crafted request from an admin is refused regardless.
 */
const OwnerContext = createContext(false);

export function OwnerProvider({ isOwner, children }: { isOwner: boolean; children: React.ReactNode }) {
  return <OwnerContext.Provider value={isOwner}>{children}</OwnerContext.Provider>;
}

export function useIsOwner(): boolean {
  return useContext(OwnerContext);
}
