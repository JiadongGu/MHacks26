"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PaletteButton } from "@/components/command-palette";
import { pageTitle } from "@/components/nav";

/** Slim desktop bar: where you are, and the jump-to field. Phones use the header in the shell instead. */
export function TopBar() {
  const title = pageTitle(usePathname());
  return (
    <div className="sticky top-0 z-20 hidden h-12 items-center justify-between border-b border-border bg-background/85 px-12 backdrop-blur-md print:hidden md:flex">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm">
          <li>
            <Link href="/dashboard" className="text-muted-foreground transition-colors hover:text-foreground">
              Pulse
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </li>
          <li aria-current="page" className="font-medium">
            {title}
          </li>
        </ol>
      </nav>
      <PaletteButton />
    </div>
  );
}
