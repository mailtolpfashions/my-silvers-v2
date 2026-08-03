"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Mounts next-themes so the `.dark` palette in globals.css can actually apply.
 * Without this the `.dark` class is never set on <html> and useTheme() (used by
 * components/ui/sonner.tsx) silently falls back to its default.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
