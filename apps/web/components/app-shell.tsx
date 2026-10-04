import Link from "next/link";
import type { ReactNode } from "react";
import { UserButton } from "@neondatabase/auth-ui";
import { SiteFooter } from "@/components/site-footer";
import {
  BottomNav,
  DEMO_NAV,
  ONBOARDING_NAV,
  SideNav,
  TopLinks,
  type NavItem,
} from "@/components/nav";

export function Wordmark() {
  return (
    <Link
      href="/dashboard"
      className="font-heading text-xl font-medium tracking-tight"
    >
      Pulse
    </Link>
  );
}

export function AppShell({
  children,
  showDemo,
}: {
  children: ReactNode;
  showDemo: boolean;
}) {
  const extra: NavItem[] = [ONBOARDING_NAV, ...(showDemo ? [DEMO_NAV] : [])];
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr] print:block">
      <a
        href="#main"
        className="sr-only print:hidden focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="hidden print:hidden! border-r border-sidebar-border bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:justify-between md:px-4 md:py-6">
        <div className="flex flex-col gap-8">
          <div className="px-3">
            <Wordmark />
          </div>
          <SideNav extra={extra} />
        </div>
        <div className="flex items-center justify-between px-3">
          <UserButton size="icon" />
          <SiteFooter className="max-w-28 text-right" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-20 md:pb-0 print:pb-0">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden print:hidden">
          <Wordmark />
          <div className="flex items-center gap-4">
            <TopLinks extra={extra} />
            <UserButton size="icon" />
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-8 md:px-12 md:py-12 print:p-0">
          {children}
        </main>
        <SiteFooter className="px-4 pb-6 md:hidden print:hidden" />
      </div>

      <BottomNav />
    </div>
  );
}
