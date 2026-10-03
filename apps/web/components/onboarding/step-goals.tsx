"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNote } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import { AREA_LABEL, groupByArea, toggleFocus, type FocusCatalog } from "@/lib/focus";
import { cn } from "@/lib/utils";

/** Step 5. The person picks a few areas to focus on. No numbers are asked for. */
export function StepGoals({ onDone }: { onDone: () => void }) {
  const [catalog, setCatalog] = useState<FocusCatalog | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([agent<FocusCatalog>("/focus/catalog"), agent<{ keys: string[] }>("/focus")])
      .then(([cat, picks]) => {
        if (!live) return;
        setCatalog(cat);
        setSelected(picks.keys);
      })
      .catch((err) => {
        if (!live) return;
        const text = errorText(err);
        setLoadError(text);
        toast.error(`Could not load the focus areas: ${text}`);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  async function save() {
    setSaving(true);
    try {
      await agent("/focus", { method: "PUT", body: { keys: selected } });
      if (selected.length > 0) toast.success("Your focus is saved.");
      onDone();
    } catch (err) {
      toast.error(`Could not save your focus: ${errorText(err)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loadError && !catalog) {
    return (
      <ErrorNote
        className="max-w-xl"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoadError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        }
      >
        Could not load the focus areas. {loadError}
      </ErrorNote>
    );
  }
  if (!catalog) return <Skeleton role="status" aria-label="Loading focus areas" className="h-64 max-w-2xl" />;

  const max = catalog.max_picks;
  const full = selected.length >= max;

  return (
    <div className="max-w-2xl space-y-8">
      <p className="max-w-[60ch] text-sm text-muted-foreground">
        Pick up to {max} things you want to work on. There are no numbers to hit. Pulse shapes your day around
        what you choose, and adjusts it each night to fit your calendar.
      </p>

      {groupByArea(catalog.items).map((group) => (
        <section key={group.area} aria-labelledby={`focus-${group.area}`}>
          <h3 id={`focus-${group.area}`} className="mb-3 text-sm font-medium">
            {AREA_LABEL[group.area]}
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.items.map((item) => {
              const on = selected.includes(item.key);
              const blocked = full && !on;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={blocked}
                    title={blocked ? `You can pick up to ${max}. Unselect one to change.` : undefined}
                    onClick={() => setSelected((s) => toggleFocus(s, item.key, max))}
                    className={cn(
                      "flex h-full w-full items-start gap-3 rounded-lg border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                      on ? "border-foreground bg-muted" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                        on ? "border-foreground bg-foreground text-background" : "border-input",
                      )}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-medium">{item.label}</span>
                      <span className="block text-sm text-muted-foreground">{item.blurb}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" className="h-10 px-5" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving..." : selected.length === 0 ? "Skip for now" : "Save and continue"}
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {selected.length} of {max} chosen
          {full ? ". Unselect one to change your picks." : ""}
        </p>
      </div>
    </div>
  );
}
