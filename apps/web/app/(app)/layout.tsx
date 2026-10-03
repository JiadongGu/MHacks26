import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth/server";
import { isTeamEmail } from "@/lib/team";

// These pages read the session, so they render on each request.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  // proxy.ts already guards these routes. This check is a second guard.
  if (!user) redirect("/auth/sign-in");
  return <AppShell showDemo={isTeamEmail(user.email)}>{children}</AppShell>;
}
