"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

// The Clerk instance display name ("My Application") can only be renamed in
// the Clerk Dashboard — these overrides fix the visible card copy from code
// so the auth screens say Sitefile regardless.
const localization = {
  signIn: {
    start: {
      title: "Sign in to Sitefile",
      subtitle: "Welcome back — sign in to continue",
    },
  },
  signUp: {
    start: {
      title: "Create your Sitefile account",
      subtitle: "Track site progress and send client-ready reports",
    },
  },
};

export function ClerkWrapper({ children }: { children: ReactNode }) {
  // Skip ClerkProvider when publishable key is missing (demo mode)
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return <>{children}</>;
  }
  return <ClerkProvider localization={localization}>{children}</ClerkProvider>;
}
