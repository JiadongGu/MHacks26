"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  ListChecks,
  MessageSquare,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  /** Shorter text for the mobile bottom bar, where six items share the width. */
  shortLabel?: string;
  icon: LucideIcon;
  /** On phones this item is an icon in the top bar instead of a bottom tab. */
  topOnMobile?: boolean;
};

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  { href: "/trends", label: "Trends", icon: LineChart },
  { href: "/conversations", label: "Conversations", shortLabel: "Chats", icon: MessageSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/twin", label: "Twin", icon: HeartPulse },
  { href: "/goals", label: "Goals", icon: Target, topOnMobile: true },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings, topOnMobile: true },
];

export const ONBOARDING_NAV: NavItem = {
  href: "/onboarding",
  label: "Setup",
  icon: ListChecks,
};

export const DEMO_NAV: NavItem = {
  href: "/demo",
  label: "Demo",
  icon: FlaskConical,
};

function useActive(href: string) {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SideLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "active:bg-sidebar-accent/70",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export function SideNav({ extra }: { extra: NavItem[] }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {MAIN_NAV.map((item) => (
        <SideLink key={item.href} item={item} />
      ))}
      {extra.length > 0 && (
        <>
          <hr className="my-3 border-sidebar-border" />
          {extra.map((item) => (
            <SideLink key={item.href} item={item} />
          ))}
        </>
      )}
    </nav>
  );
}

function BottomLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={cn(
        "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium text-muted-foreground transition-colors",
        "hover:text-foreground active:bg-sidebar-accent",
        active && "text-foreground",
      )}
    >
      <Icon
        className={cn("size-5", active && "text-primary")}
        aria-hidden="true"
      />
      <span className={cn("max-w-full truncate", active && "underline decoration-primary decoration-2 underline-offset-4")}>
        {item.shortLabel ?? item.label}
      </span>
    </Link>
  );
}

export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] print:hidden md:hidden"
    >
      {MAIN_NAV.filter((item) => !item.topOnMobile).map((item) => (
        <BottomLink key={item.href} item={item} />
      ))}
    </nav>
  );
}

export function TopLinks({ extra }: { extra: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secondary" className="flex items-center gap-4 text-sm">
      {MAIN_NAV.filter((item) => item.topOnMobile).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-label={item.label}
          aria-current={pathname.startsWith(item.href) ? "page" : undefined}
          className="text-muted-foreground hover:text-foreground aria-[current=page]:text-primary"
        >
          <item.icon className="size-5" aria-hidden="true" />
        </Link>
      ))}
      {extra.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname.startsWith(item.href) ? "page" : undefined}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline aria-[current=page]:text-foreground aria-[current=page]:underline"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
