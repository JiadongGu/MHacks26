"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { FlaskConical, LogOut, Search, Share2, type LucideIcon } from "lucide-react";
import { DEMO_NAV, MAIN_NAV, ONBOARDING_NAV } from "@/components/nav";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  label: string;
  group: "Go to" | "Actions";
  icon: LucideIcon;
  href: string;
  keywords?: string;
};

const PaletteContext = createContext<{ open: () => void }>({ open: () => {} });

export const usePalette = () => useContext(PaletteContext);

const noop = () => () => {};
function useIsMac() {
  return useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
}

function buildItems(showDemo: boolean): Item[] {
  const pages: Item[] = [...MAIN_NAV, ONBOARDING_NAV, ...(showDemo ? [DEMO_NAV] : [])].map((n) => ({
    id: `go-${n.href}`,
    label: n.label,
    group: "Go to",
    icon: n.icon,
    href: n.href,
  }));
  const actions: Item[] = [
    ...(showDemo
      ? [
          {
            id: "act-demo",
            label: "Run demo scenario",
            group: "Actions" as const,
            icon: FlaskConical,
            href: "/demo",
            keywords: "simulate scenario judges",
          },
        ]
      : []),
    {
      id: "act-share",
      label: "Share with clinician",
      group: "Actions",
      icon: Share2,
      href: "/share",
      keywords: "doctor summary print export",
    },
    {
      id: "act-signout",
      label: "Sign out",
      group: "Actions",
      icon: LogOut,
      href: "/auth/sign-out",
      keywords: "log out logout",
    },
  ];
  return [...pages, ...actions];
}

export function PaletteProvider({ children, showDemo }: { children: ReactNode; showDemo: boolean }) {
  const [open, setOpen] = useState(false);
  const openIt = useCallback(() => setOpen(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open: openIt }), [openIt]);
  return (
    <PaletteContext.Provider value={value}>
      {children}
      <Palette open={open} onOpenChange={setOpen} showDemo={showDemo} />
    </PaletteContext.Provider>
  );
}

function Palette({
  open,
  onOpenChange,
  showDemo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showDemo: boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo(() => buildItems(showDemo), [showDemo]);
  const results = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return items;
    return items.filter((i) => {
      const hay = `${i.label} ${i.keywords ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [items, query]);

  const index = Math.min(active, Math.max(results.length - 1, 0));
  const optionId = (i: Item) => `${listId}-${i.id}`;
  const current = results[index];

  useEffect(() => {
    if (!open || !current) return;
    document.getElementById(`${listId}-${current.id}`)?.scrollIntoView({ block: "nearest" });
  }, [open, current, listId]);

  function change(next: boolean) {
    if (!next) {
      setQuery("");
      setActive(0);
    }
    onOpenChange(next);
  }

  function run(item: Item) {
    change(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((index + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((index - 1 + results.length) % results.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(results.length - 1);
    } else if (e.key === "Enter" && current) {
      e.preventDefault();
      run(current);
    }
  }

  const groups = (["Go to", "Actions"] as const)
    .map((g) => ({ name: g, items: results.filter((r) => r.group === g) }))
    .filter((g) => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        showCloseButton={false}
        className="top-[16%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Jump to</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter pages and actions. Use the arrow keys to move and Enter to open.
        </DialogDescription>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={current ? optionId(current) : undefined}
            aria-label="Search pages and actions"
            autoComplete="off"
            spellCheck={false}
            placeholder="Jump to a page or run an action"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.name} role="group" aria-label={g.name}>
              <p aria-hidden="true" className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {g.name}
              </p>
              {g.items.map((i) => {
                const selected = i === current;
                const Icon = i.icon;
                return (
                  <div
                    key={i.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={selected}
                    onPointerMove={() => setActive(results.indexOf(i))}
                    onClick={() => run(i)}
                    className={cn(
                      "flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm",
                      selected ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1 truncate font-medium">{i.label}</span>
                    {selected && <span className="text-xs">Enter</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Arrow keys to move, Enter to open, Esc to close.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** The search field in the desktop top bar, and an icon on phones. */
export function PaletteButton({ compact = false }: { compact?: boolean }) {
  const { open } = usePalette();
  const mac = useIsMac();
  if (compact) {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Search pages and actions"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-5" aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search pages and actions"
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
      className="flex h-8 w-64 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground"
    >
      <Search className="size-3.5" aria-hidden="true" />
      <span className="flex-1 text-left">Jump to</span>
      <kbd className="num rounded border border-border bg-secondary px-1.5 font-sans text-xs text-foreground/75">
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
