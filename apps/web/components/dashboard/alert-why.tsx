"use client";

import { useId, useState } from "react";
import { ChevronDown, CircleCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNote } from "@/components/ui-bits";
import { errorText, me } from "@/lib/api-client";
import {
  formatDelta,
  formatValue,
  hasContent,
  metricLabel,
  parseExplain,
  rangeLabel,
  sourceLabel,
  type Explain,
} from "@/lib/explain";
import { cn } from "@/lib/utils";

type Props = { alertId: string; title: string; explain: Explain | null };

/** A "Why?" button and the panel it opens. The panel loads its data on first open when the list has none. */
export function AlertWhy({ alertId, title, explain: initial }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [explain, setExplain] = useState<Explain | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await me<{ explain: unknown }>(`/alerts/${alertId}/explain`);
      const parsed = parseExplain(res?.explain);
      if (parsed) setExplain(parsed);
      else setError("Pulse has no explanation for this alert.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !explain && !loading) void load();
  }

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2.5"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        Why?
        <span className="sr-only"> Pulse sent &ldquo;{title}&rdquo;</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("transition-transform", open && "rotate-180")}
        />
      </Button>
      <div id={panelId} hidden={!open}>
        {open && (
          <div className="mt-2" aria-live="polite" aria-busy={loading}>
            {loading && <WhySkeleton />}
            {!loading && error && (
              <ErrorNote
                action={
                  <Button variant="outline" size="sm" onClick={() => void load()}>
                    Try again
                  </Button>
                }
              >
                Could not load the explanation. {error}
              </ErrorNote>
            )}
            {!loading && !error && explain && <ExplainPanel explain={explain} />}
          </div>
        )}
      </div>
    </div>
  );
}

function WhySkeleton() {
  return (
    <div role="status" aria-label="Loading explanation" className="space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

function Heading({ children }: { children: string }) {
  return <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h4>;
}

export function ExplainPanel({ explain }: { explain: Explain }) {
  const empty = !hasContent(explain);
  return (
    <div className="max-w-[65ch] space-y-4 rounded-lg border border-border px-4 py-3 text-sm">
      <p>{explain.summary}</p>
      {explain.estimated && (
        <p className="text-xs text-muted-foreground">
          Pulse rebuilt this from the saved readings of an older alert. Your record may have changed since then.
        </p>
      )}
      {empty && (
        <p className="text-muted-foreground">Pulse saved no readings or thresholds for this alert.</p>
      )}

      {explain.comparisons.length > 0 && (
        <section aria-label="Your numbers" className="space-y-2">
          <Heading>Your numbers</Heading>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Today compared with your baseline or threshold</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="py-1 pr-3 font-medium">Measure</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Today</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Baseline or limit</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Difference</th>
                  <th scope="col" className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {explain.comparisons.map((c) => (
                  <tr key={c.label} className="border-b border-border last:border-b-0">
                    <th scope="row" className="py-1.5 pr-3 font-medium">{c.label}</th>
                    <td className={cn("py-1.5 pr-3 tabular-nums", c.flagged && "font-semibold")}>
                      {formatValue(c.today, c.unit)}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatValue(c.baseline_or_threshold, c.unit)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatDelta(c.delta, c.unit)}</td>
                    <td className="py-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium",
                          c.flagged ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {c.flagged ? (
                          <TriangleAlert className="size-3.5" aria-hidden="true" />
                        ) : (
                          <CircleCheck className="size-3.5" aria-hidden="true" />
                        )}
                        {rangeLabel(c)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-label="From your record" className="space-y-1">
        <Heading>From your record</Heading>
        {explain.twin_rules.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5">
            {explain.twin_rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nothing in your health record changed this alert.</p>
        )}
      </section>

      {explain.data_used.length > 0 && (
        <section aria-label="Data used" className="space-y-1">
          <Heading>Data used</Heading>
          <ul className="space-y-1">
            {explain.data_used.map((d) => (
              <li key={`${d.metric}-${d.window}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{metricLabel(d.metric)}</span>
                <span className="text-muted-foreground">{d.window}</span>
                <Badge variant="outline">{sourceLabel(d.source)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {explain.watch_next && (
        <section aria-label="What to watch" className="space-y-1">
          <Heading>What to watch</Heading>
          <p>{explain.watch_next}</p>
        </section>
      )}
    </div>
  );
}
