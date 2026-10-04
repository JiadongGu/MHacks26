import Link from "next/link";
import type { ReactNode } from "react";
import { HeartPulse } from "lucide-react";
import { UserButton } from "@neondatabase/auth-ui";
import { PulseField } from "@/components/ambient/pulse-field";
import { AmbientLayer } from "@/components/ambient-layer";
import { PaletteButton, PaletteProvider } from "@/components/command-palette";
import { SiteFooter } from "@/components/site-footer";
import { TopBar } from "@/components/top-bar";
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
      className="inline-flex items-center gap-2 rounded-md text-xl font-bold tracking-tight"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-heart/10">
        <HeartPulse className="size-[1.125rem] text-heart" aria-hidden="true" />
      </span>
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
    <PaletteProvider showDemo={showDemo}>
      <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr] print:block">
        <AmbientLayer>
          <div className="ambient-fade">
            <PulseField intensity="ambient" bpm={64} />
          </div>
        </AmbientLayer>
        <a
          href="#main"
          className="sr-only print:hidden focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <aside className="hidden print:hidden! border-r border-sidebar-border bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:justify-between md:overflow-y-auto md:px-4 md:py-6">
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
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:hidden print:hidden">
            <Wordmark />
            <div className="flex items-center gap-3.5">
              <PaletteButton compact />
              <TopLinks extra={extra} />
              <UserButton size="icon" />
            </div>
          </header>
          <TopBar />
          <main id="main" className="w-full max-w-[88rem] flex-1 px-4 py-8 md:px-12 md:py-10 print:p-0">
            {children}
          </main>
          <SiteFooter className="px-4 pb-6 md:hidden print:hidden" />
        </div>

        <BottomNav />
      </div>
    </PaletteProvider>
  );
}
