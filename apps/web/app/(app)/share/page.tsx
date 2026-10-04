import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/share/print-button";
import { StatusChip } from "@/components/trends/metric-card";
import { ErrorNote } from "@/components/ui-bits";
import { localDay } from "@/lib/briefing";
import { addDays, zoneOrDefault } from "@/lib/calendar-week";
import { ageOn, formatDate, humanize } from "@/lib/format";
import { formatValue } from "@/lib/metrics";
import { getDailyMetricRows, getLatestTwin, listAlerts } from "@/lib/queries";
import { requireOnboarded } from "@/lib/session";
import { buildTrends } from "@/lib/trends";
import { readTwin } from "@/lib/twin";
import { formatHeight, formatWeight } from "@/lib/units";

export const metadata: Metadata = { title: "Share with clinician" };
export const dynamic = "force-dynamic";

const DAYS = 30;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-3 print:break-inside-avoid">
      <h2 className="mb-2 text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ items, empty }: { items: { key: string; text: string; meta?: string | null }[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {items.map((i) => (
        <li key={i.key} className="flex flex-wrap justify-between gap-x-4 py-1.5">
          <span>{i.text}</span>
          {i.meta && <span className="text-muted-foreground">{i.meta}</span>}
        </li>
      ))}
    </ul>
  );
}

const withUnit = (unit: string, key: string, v: number | null) =>
  v === null ? "-" : `${formatValue(key, v)}${unit && key !== "sleep_total_min" ? ` ${unit}` : ""}`;

export default async function SharePage() {
  const { user, profile } = await requireOnboarded();
  const zone = zoneOrDefault(profile.timezone);
  const today = localDay(zone);
  const now = new Date();

  let data;
  try {
    const [rows, twin, alerts] = await Promise.all([
      getDailyMetricRows(user.id, addDays(today, -(2 * DAYS - 1))),
      getLatestTwin(user.id),
      listAlerts(user.id, 100),
    ]);
    const view = twin ? readTwin(twin.model) : null;
    const since = now.getTime() - DAYS * 86_400_000;
    data = {
      view,
      trends: buildTrends(rows, today, DAYS, view?.baselines ?? {}),
      alerts: alerts.filter((a) => new Date(a.created_at).getTime() >= since),
    };
  } catch (err) {
    console.error("SharePage failed", err);
  }

  const age = ageOn(profile.dob, today) ?? (typeof data?.view?.profile.age === "number" ? data.view.profile.age : null);

  return (
    <article className="max-w-3xl space-y-8 print:max-w-none print:space-y-5 print:text-sm">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">Clinician summary</p>
          <h1 className="text-3xl">{profile.display_name?.trim() || "Patient summary"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {[
              age !== null ? `Age ${age}` : null,
              profile.sex ? humanize(profile.sex) : null,
              profile.height_cm ? formatHeight(profile.height_cm) : null,
              profile.weight_kg ? formatWeight(profile.weight_kg) : null,
            ]
              .filter(Boolean)
              .join(", ") || "No profile details."}
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <Link href="/trends" className="text-sm underline underline-offset-4">
            Back to trends
          </Link>
          <PrintButton />
        </div>
      </header>

      {!data && <ErrorNote>Could not load your summary. Reload the page to try again.</ErrorNote>}

      {data && (
        <>
          <Block title="Conditions">
            <Rows
              empty="No conditions on record."
              items={(data.view?.conditions ?? []).map((c) => ({
                key: `${c.code ?? ""}${c.display}`,
                text: c.display,
                meta: c.status,
              }))}
            />
          </Block>

          <Block title="Medications">
            <Rows
              empty="No medications on record."
              items={(data.view?.medications ?? []).map((m) => ({
                key: `${m.rxnorm ?? ""}${m.display}`,
                text: m.display,
                meta: m.class,
              }))}
            />
          </Block>

          <Block title="Allergies">
            <Rows
              empty="No allergies on record."
              items={(data.view?.allergies ?? []).map((a) => ({ key: a, text: humanize(a) }))}
            />
          </Block>

          <Block title="Recent labs">
            <Rows
              empty="No lab results on record."
              items={(data.view?.labs ?? []).map((l) => ({
                key: `${l.loinc ?? l.display}${l.date ?? ""}`,
                text: l.display,
                meta: `${l.value} ${l.unit ?? ""}${l.date ? `, ${formatDate(l.date, zone)}` : ""}`.trim(),
              }))}
            />
          </Block>

          <Block title={`Wearable vitals, last ${DAYS} days`}>
            {data.trends.every((t) => t.latest === null) ? (
              <p className="text-sm text-muted-foreground">No wearable data in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th scope="col" className="py-1.5 pr-4 font-medium">Metric</th>
                      <th scope="col" className="py-1.5 pr-4 font-medium">Latest</th>
                      <th scope="col" className="py-1.5 pr-4 font-medium">{DAYS}-day avg</th>
                      <th scope="col" className="py-1.5 pr-4 font-medium">Baseline</th>
                      <th scope="col" className="py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.trends.map((t) => (
                      <tr key={t.key}>
                        <th scope="row" className="py-1.5 pr-4 font-normal">{t.label}</th>
                        <td className="py-1.5 pr-4 font-mono">{withUnit(t.unit, t.key, t.latest)}</td>
                        <td className="py-1.5 pr-4 font-mono">{withUnit(t.unit, t.key, t.avg)}</td>
                        <td className="py-1.5 pr-4 font-mono">{withUnit(t.unit, t.key, t.baseline)}</td>
                        <td className="py-1.5">
                          {t.status ? <StatusChip status={t.status} /> : <span className="text-muted-foreground">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Block>

          <Block title={`Alerts, last ${DAYS} days`}>
            <Rows
              empty="No alerts in this period."
              items={data.alerts.map((a) => ({
                key: a.id,
                text: `${humanize(a.severity)}: ${a.title}`,
                meta: formatDate(a.created_at, zone),
              }))}
            />
          </Block>
        </>
      )}

      <footer className="border-t border-border pt-3 text-xs text-muted-foreground">
        Generated by Pulse on {formatDate(now, zone)}. Wearable data, not a medical device. Not a diagnosis.
      </footer>
    </article>
  );
}
