"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
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

const byHref = (href: string) => MAIN_NAV.find((i) => i.href === href)!;

/** Sidebar sections. The Account section also takes the extra items (setup, demo). */
const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [byHref("/dashboard"), byHref("/trends")] },
  { label: "Health", items: [byHref("/twin"), byHref("/goals"), byHref("/alerts")] },
  { label: "Agent", items: [byHref("/conversations")] },
  { label: "Account", items: [byHref("/settings")] },
];

const EXTRA_TITLES: Record<string, string> = {
  "/share": "Clinician summary",
  "/onboarding": "Setup",
  "/demo": "Demo",
};

export function pageTitle(pathname: string): string {
  const hit = [...MAIN_NAV, ONBOARDING_NAV, DEMO_NAV].find(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
  if (hit) return hit.label;
  const key = Object.keys(EXTRA_TITLES).find((k) => pathname.startsWith(k));
  return key ? EXTRA_TITLES[key] : "Pulse";
}

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
        "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors",
        "hover:bg-secondary hover:text-foreground active:bg-secondary/70",
        active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export function SideNav({ extra }: { extra: NavItem[] }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {GROUPS.map((g) => {
        const items = g.label === "Account" ? [...g.items, ...extra] : g.items;
        const id = `nav-${g.label.toLowerCase()}`;
        return (
          <div key={g.label}>
            <p id={id} className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {g.label}
            </p>
            <ul aria-labelledby={id} className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.href}>
                  <SideLink item={item} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
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
        "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium text-muted-foreground transition-colors",
        "hover:text-foreground active:bg-sidebar-accent/60",
        active && "text-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0 h-0.5 w-8 rounded-full bg-primary transition-[opacity,transform] duration-200",
          active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
        )}
      />
      <Icon className={cn("size-5 transition-transform", active && "scale-110 text-primary")} aria-hidden="true" />
      <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
    </Link>
  );
}

export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-sidebar-border bg-sidebar/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl print:hidden md:hidden"
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
          className="text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-primary"
        >
          <item.icon className="size-5" aria-hidden="true" />
        </Link>
      ))}
      {extra.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname.startsWith(item.href) ? "page" : undefined}
          className="hidden text-muted-foreground underline-offset-4 hover:text-foreground hover:underline aria-[current=page]:text-foreground aria-[current=page]:underline sm:inline"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
