import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote, Section } from "@/components/ui-bits";
import { AgentConfigError, agentFetch } from "@/lib/agent";
import { formatDate, formatDateTime, humanize, timeAgo } from "@/lib/format";
import { formatMinutes } from "@/lib/goals";
import { getLatestTwin, listTwinVersions } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import {
  BASELINE_LABEL,
  STATUS_LABEL,
  readTwin,
  sourceLabel,
  type TwinView,
} from "@/lib/twin";

export const metadata: Metadata = { title: "Twin" };
export const dynamic = "force-dynamic";

type Version = { version: number; created_at: string; summary: string };

/** Reads the version list from the agent. If the agent is down, it reads the same rows from Neon. */
async function loadVersions(userId: string): Promise<Version[]> {
  try {
    const res = await agentFetch(`/twin/${userId}/versions`);
    if (res.ok) return (await res.json()) as Version[];
  } catch (err) {
    if (!(err instanceof AgentConfigError)) console.error("versions fetch failed", err);
  }
  return listTwinVersions(userId);
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (Array.isArray(value)) return value.join(" / ");
  return String(value);
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-8 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function None({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function List({ items }: { items: { key: string; text: string; meta?: string | null }[] }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((i) => (
        <li key={i.key} className="flex flex-wrap justify-between gap-x-4 py-2 text-sm">
          <span>{i.text}</span>
          {i.meta && <span className="text-muted-foreground">{i.meta}</span>}
        </li>
      ))}
    </ul>
  );
}

function baselineValue(key: string, value: unknown): string {
  if (typeof value !== "number") return "Not set";
  if (key === "sleep_min") return formatMinutes(value);
  const unit = BASELINE_LABEL[key]?.unit;
  return `${Math.round(value).toLocaleString("en-US")} ${unit ?? ""}`.trim();
}

function TwinBody({ view }: { view: TwinView }) {
  const p = view.profile;
  const days = typeof view.baselines.computed_from_days === "number" ? view.baselines.computed_from_days : 0;
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
      <div className="space-y-12">
        <Section title="Profile" headingId="t-profile">
          <Facts
            rows={[
              ["Age", show(p.age)],
              ["Sex", show(p.sex)],
              ["Height", p.height_cm ? `${show(p.height_cm)} cm` : "Not set"],
              ["Weight", p.weight_kg ? `${show(p.weight_kg)} kg` : "Not set"],
              ["Time zone", show(p.timezone)],
            ]}
          />
        </Section>

        <Section title="Conditions" headingId="t-conditions">
          {view.conditions.length === 0 ? (
            <None>No conditions on record.</None>
          ) : (
            <List
              items={view.conditions.map((c) => ({
                key: `${c.code ?? ""}${c.display}`,
                text: c.display,
                meta: [c.status, c.source === "self_reported" ? "self-reported" : c.source]
                  .filter(Boolean)
                  .join(", "),
              }))}
            />
          )}
        </Section>

        <Section title="Medications" headingId="t-meds">
          {view.medications.length === 0 ? (
            <None>No medications on record.</None>
          ) : (
            <List
              items={view.medications.map((m) => ({
                key: `${m.rxnorm ?? ""}${m.display}`,
                text: m.display,
                meta: m.class,
              }))}
            />
          )}
        </Section>

        <Section title="Allergies" headingId="t-allergies">
          {view.allergies.length === 0 ? (
            <None>No allergies on record.</None>
          ) : (
            <List items={view.allergies.map((a) => ({ key: a, text: humanize(a) }))} />
          )}
        </Section>

        <Section title="Labs" headingId="t-labs">
          {view.labs.length === 0 ? (
            <None>No lab results on record.</None>
          ) : (
            <List
              items={view.labs.map((l) => ({
                key: `${l.loinc ?? l.display}${l.date ?? ""}`,
                text: l.display,
                meta: `${l.value} ${l.unit ?? ""}${l.date ? `, ${formatDate(l.date)}` : ""}`.trim(),
              }))}
            />
          )}
        </Section>

        <Section title="Family history" headingId="t-family">
          <p className="mb-3 text-sm text-muted-foreground">Self-reported. Pulse did not verify it.</p>
          {view.familyHistory.length === 0 ? (
            <None>No family history added.</None>
          ) : (
            <List
              items={view.familyHistory.map((f) => ({
                key: `${f.relation}${f.condition}`,
                text: `${humanize(f.relation)}: ${f.condition}`,
                meta: "self-reported",
              }))}
            />
          )}
        </Section>
      </div>

      <div className="space-y-12">
        <Section title="Baselines" headingId="t-baselines">
          <ul className="divide-y divide-border border-y border-border">
            {Object.entries(BASELINE_LABEL).map(([key, info]) => (
              <li key={key} className="py-3">
                <div className="flex justify-between gap-4 text-sm">
                  <span>{info.label}</span>
                  <span className="font-mono">{baselineValue(key, view.baselines[key])}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{sourceLabel(view.baselineSources[key])}</p>
              </li>
            ))}
            <li className="py-3">
              <div className="flex justify-between gap-4 text-sm">
                <span>Clinic blood pressure</span>
                <span className="font-mono">{show(view.baselines.clinical_bp)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Your imported record</p>
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {days > 0 ? `Wearable data from the last ${days} days.` : "No wearable data yet."}
          </p>
        </Section>

        <Section title="Thresholds" headingId="t-thresholds">
          {Object.keys(view.thresholds).length === 0 ? (
            <None>Pulse sets thresholds when your twin is built.</None>
          ) : (
            <Facts rows={Object.entries(view.thresholds).map(([k, v]) => [humanize(k), show(v)])} />
          )}
          {view.riskFlags.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Tightened for: {view.riskFlags.map(humanize).join(", ")}.
            </p>
          )}
        </Section>

        {view.insights.length > 0 && (
          <Section title="Insights" headingId="t-insights">
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {view.insights.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

export default async function TwinPage() {
  const user = await requireUser();

  let twin;
  let loadFailed = false;
  try {
    twin = await getLatestTwin(user.id);
  } catch (err) {
    console.error("TwinPage failed", err);
    loadFailed = true;
  }
  const versions = loadFailed ? [] : await loadVersions(user.id).catch(() => [] as Version[]);
  const view = twin ? readTwin(twin.model) : null;

  return (
    <>
      <PageHeader eyebrow="Your model" title="Digital twin">
        {view?.status
          ? `Status: ${STATUS_LABEL[view.status]}. ${twin?.summary ?? ""}`
          : "What Pulse knows about you, and where each fact comes from."}
      </PageHeader>

      {loadFailed && <ErrorNote className="max-w-[60ch]">Could not load your twin. Reload the page to try again.</ErrorNote>}

      {!loadFailed && !view && (
        <EmptyState
          className="max-w-[60ch]"
          title="Your twin is not built yet"
          action={
            <Button asChild>
              <Link href="/onboarding">Finish setup</Link>
            </Button>
          }
        >
          Pulse builds it from your profile and your imported record.
        </EmptyState>
      )}

      {view && <TwinBody view={view} />}

      {!loadFailed && (
        <div className="mt-12 max-w-3xl">
          <Section title="Version timeline" headingId="t-versions">
            {versions.length === 0 ? (
              <None>No versions yet.</None>
            ) : (
              <ol className="divide-y divide-border border-y border-border">
                {versions.map((v) => (
                  <li key={v.version} className="grid gap-x-6 py-3 sm:grid-cols-[5rem_1fr_auto]">
                    <span className="font-mono text-sm">v{v.version}</span>
                    <span className="min-w-0 text-sm">{v.summary || "No summary."}</span>
                    <time
                      dateTime={v.created_at}
                      title={formatDateTime(v.created_at)}
                      suppressHydrationWarning
                      className="text-xs text-muted-foreground"
                    >
                      {timeAgo(v.created_at)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
