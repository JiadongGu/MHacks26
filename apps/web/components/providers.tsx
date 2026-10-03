"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { Toaster } from "@/components/ui/sonner";
import { authClient } from "@/lib/auth/client";

// Google sign-in works only when the Neon Auth project enables the Google provider.
const social =
  process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1"
    ? { providers: ["google" as const] }
    : undefined;

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      defaultTheme="dark"
      redirectTo="/dashboard"
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      Link={Link}
      social={social}
    >
      {children}
      <Toaster />
    </NeonAuthUIProvider>
  );
}
