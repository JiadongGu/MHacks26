import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Pill, Share2, Stethoscope, TriangleAlert, UserRound, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, ErrorNote, Section, StatusPill, type StatusKind } from "@/components/ui-bits";
import { AgentConfigError, agentFetch } from "@/lib/agent";
import { formatDate, formatDateTime, humanize, timeAgo } from "@/lib/format";
import { formatMinutes } from "@/lib/goals";
import { getLatestTwin, listTwinVersions } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { formatHeight, formatWeight } from "@/lib/units";
import {
  BASELINE_LABEL,
  readTwin,
  sourceLabel,
  type TwinView,
} from "@/lib/twin";
import { cn } from "@/lib/utils";
import { labRange, shortLabName, type LabRange } from "./lab-ranges";

export const metadata: Metadata = { title: "Health record" };
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
          <dd className="num font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function None({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Rows run edge to edge inside the card, split by hairlines. */
function Rows({ children }: { children: ReactNode }) {
  return <ul className="-mx-4 divide-y divide-border border-y border-border md:-mx-5">{children}</ul>;
}

function Row({
  icon: Icon,
  title,
  sub,
  chips,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string | null;
  chips?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 md:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground/70">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {chips && <div className="flex flex-wrap justify-end gap-1.5">{chips}</div>}
    </li>
  );
}

const MARKER: Record<StatusKind, string> = { normal: "bg-ok", borderline: "bg-warn", out_of_range: "bg-bad" };

function RangeBar({ r, value, unit, name }: { r: LabRange; value: number; unit: string; name: string }) {
  const pct = (v: number) => ((Math.min(Math.max(v, r.min), r.max) - r.min) / (r.max - r.min)) * 100;
  return (
    <div>
      <div
        role="img"
        aria-label={`${name}: ${value} ${unit}. Reference range ${r.low} to ${r.high} ${unit}.`}
        className="relative h-1.5 rounded-full bg-secondary"
      >
        <span
          className="absolute inset-y-0 rounded-full bg-ok/35"
          style={{ left: `${pct(r.low)}%`, width: `${pct(r.high) - pct(r.low)}%` }}
        />
        <span
          className={cn(
            "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow-[0_0_0_1px_rgb(0_0_0/0.18)]",
            MARKER[r.status],
          )}
          style={{ left: `${pct(value)}%` }}
        />
      </div>
      <p className="num mt-1.5 text-xs text-muted-foreground">
        Reference {r.low} to {r.high} {unit}
      </p>
    </div>
  );
}

function LabRow({ lab }: { lab: TwinView["labs"][number] }) {
  const name = shortLabName(lab.display);
  const r = labRange(lab.display, lab.unit, lab.value);
  const unit = lab.unit ?? "";
  return (
    <li className="px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium">{name}</p>
          {lab.date && <p className="text-xs text-muted-foreground">{formatDate(lab.date)}</p>}
        </div>
        <div className="flex items-center gap-3">
          {r && <StatusPill status={r.status} />}
          <p className="num text-base font-semibold">
            {lab.value} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
          </p>
        </div>
      </div>
      {r && (
        <div className="mt-3 max-w-md">
          <RangeBar r={r} value={lab.value} unit={unit} name={name} />
        </div>
      )}
    </li>
  );
}

function baselineValue(key: string, value: unknown): string {
  if (typeof value !== "number") return "Not set";
  if (key === "sleep_min") return formatMinutes(value);
  const unit = BASELINE_LABEL[key]?.unit;
  return `${Math.round(value).toLocaleString("en-US")} ${unit ?? ""}`.trim();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num mt-0.5 text-base font-semibold">{value}</dd>
    </div>
  );
}

const THRESHOLD_LABEL: Record<string, string> = {
  bp_warn: "Blood pressure alert above",
  spo2_warn: "Blood oxygen alert below",
  workout_hr: "Workout heart rate",
  rhr_delta_warn: "Resting heart rate rise",
  inactivity_steps_3h: "Inactive if under, in 3 h",
};
const THRESHOLD_UNIT: Record<string, string> = {
  spo2_warn: "%",
  workout_hr: " bpm",
  rhr_delta_warn: " bpm",
  inactivity_steps_3h: " steps",
};
const RISK_LABEL: Record<string, string> = {
  t2dm: "type 2 diabetes",
  hypertension: "hypertension",
  afib: "atrial fibrillation",
  ckd: "chronic kidney disease",
  heart_failure: "heart failure",
  skin_cancer: "skin cancer history",
};

function TwinBody({ view }: { view: TwinView }) {
  const p = view.profile;
  const days = typeof view.baselines.computed_from_days === "number" ? view.baselines.computed_from_days : 0;
  const ranged = view.labs.some((l) => labRange(l.display, l.unit, l.value));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <Section title="Profile" headingId="t-profile" index={0}>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <Stat label="Age" value={show(p.age)} />
            <Stat label="Sex" value={humanize(show(p.sex))} />
            <Stat label="Height" value={p.height_cm ? formatHeight(Number(p.height_cm)) : "Not set"} />
            <Stat label="Weight" value={p.weight_kg ? formatWeight(Number(p.weight_kg)) : "Not set"} />
            <Stat label="Time zone" value={show(p.timezone)} />
          </dl>
        </Section>

        <Section title="Conditions" headingId="t-conditions" index={1}>
          {view.conditions.length === 0 ? (
            <None>No conditions on record.</None>
          ) : (
            <Rows>
              {view.conditions.map((c) => (
                <Row
                  key={`${c.code ?? ""}${c.display}`}
                  icon={Stethoscope}
                  title={c.display}
                  chips={
                    <>
                      {c.status && <Chip>{humanize(c.status)}</Chip>}
                      {c.source && <Chip>{c.source === "self_reported" ? "Self-reported" : c.source === "finchnode" ? "FinchNode" : humanize(c.source)}</Chip>}
                    </>
                  }
                />
              ))}
            </Rows>
          )}
        </Section>

        <Section title="Medications" headingId="t-meds" index={2}>
          {view.medications.length === 0 ? (
            <None>No medications on record.</None>
          ) : (
            <Rows>
              {view.medications.map((m) => (
                <Row
                  key={`${m.rxnorm ?? ""}${m.display}`}
                  icon={Pill}
                  title={m.display}
                  chips={m.class ? <Chip>{m.class}</Chip> : null}
                />
              ))}
            </Rows>
          )}
        </Section>

        <Section title="Allergies" headingId="t-allergies" index={3}>
          {view.allergies.length === 0 ? (
            <None>No allergies on record.</None>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {view.allergies.map((a) => (
                <li
                  key={a}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-warn/15 px-3 text-sm font-medium text-warn-ink"
                >
                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                  {humanize(a)}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Labs"
          headingId="t-labs"
          index={4}
          description={ranged ? "Bars compare each value with a typical adult range. Your clinic's range may differ." : undefined}
        >
          {view.labs.length === 0 ? (
            <None>No lab results on record.</None>
          ) : (
            <Rows>
              {view.labs.map((l) => (
                <LabRow key={`${l.loinc ?? l.display}${l.date ?? ""}`} lab={l} />
              ))}
            </Rows>
          )}
        </Section>

        <Section title="Family history" headingId="t-family" index={5} description="Self-reported. Pulse did not verify it.">
          {view.familyHistory.length === 0 ? (
            <None>No family history added.</None>
          ) : (
            <Rows>
              {view.familyHistory.map((f) => (
                <Row
                  key={`${f.relation}${f.condition}`}
                  icon={UserRound}
                  title={f.condition}
                  sub={humanize(f.relation)}
                  chips={<Chip>Self-reported</Chip>}
                />
              ))}
            </Rows>
          )}
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Baselines" headingId="t-baselines" index={1}>
          <Rows>
            {Object.entries(BASELINE_LABEL).map(([key, info]) => (
              <li key={key} className="px-4 py-3 md:px-5">
                <div className="flex justify-between gap-4 text-sm">
                  <span>{info.label}</span>
                  <span className="num font-semibold">{baselineValue(key, view.baselines[key])}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{sourceLabel(view.baselineSources[key])}</p>
              </li>
            ))}
            <li className="px-4 py-3 md:px-5">
              <div className="flex justify-between gap-4 text-sm">
                <span>Clinic blood pressure</span>
                <span className="num font-semibold">{show(view.baselines.clinical_bp)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Your imported record</p>
            </li>
          </Rows>
          <p className="mt-3 text-xs text-muted-foreground">
            {days > 0 ? `Wearable data from the last ${days} days.` : "No wearable data yet."}
          </p>
        </Section>

        <Section title="Thresholds" headingId="t-thresholds" index={2}>
          {Object.keys(view.thresholds).length === 0 ? (
            <None>Pulse sets thresholds when your twin is built.</None>
          ) : (
            <Facts
              rows={Object.entries(view.thresholds).map(([k, v]) => [
                THRESHOLD_LABEL[k] ?? humanize(k),
                Array.isArray(v) && v.length === 2 ? `${v[0]}/${v[1]} mmHg` : `${show(v)}${THRESHOLD_UNIT[k] ?? ""}`,
              ])}
            />
          )}
          {view.riskFlags.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Tightened for: {view.riskFlags.map((f) => RISK_LABEL[f] ?? humanize(f)).join(", ")}.
            </p>
          )}
        </Section>

        {view.insights.length > 0 && (
          <Section title="Insights" headingId="t-insights" index={3}>
            <ul className="list-disc space-y-2 pl-5 text-sm marker:text-muted-foreground">
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
      <PageHeader
        eyebrow="Digital twin"
        title="Health record"
        actions={
          <Button asChild variant="outline">
            <Link href="/share">
              <Share2 aria-hidden="true" />
              Share with clinician
            </Link>
          </Button>
        }
      >
        What Pulse knows about you, and where each fact comes from.
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
        <div className="mt-4 max-w-3xl">
          <Section title="Version timeline" headingId="t-versions" index={6}>
            {versions.length === 0 ? (
              <None>No versions yet.</None>
            ) : (
              <ol className="relative ml-1.5 border-l border-border">
                {versions.map((v, i) => (
                  <li key={v.version} className="relative pb-5 pl-6 last:pb-0">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 border-card",
                        i === 0 ? "bg-primary" : "bg-input",
                      )}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <p className="num text-sm font-semibold">Version {v.version}</p>
                      <time
                        dateTime={v.created_at}
                        title={formatDateTime(v.created_at)}
                        suppressHydrationWarning
                        className="num text-xs text-muted-foreground"
                      >
                        {timeAgo(v.created_at)}
                      </time>
                    </div>
                    <p className="mt-0.5 max-w-[65ch] text-sm text-muted-foreground">{v.summary || "No summary."}</p>
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
