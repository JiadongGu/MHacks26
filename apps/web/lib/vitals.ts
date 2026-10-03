// Live vitals access. Server only: it calls the agent with INTERNAL_TOKEN.
// The agent reads the live pool (SpacetimeDB). It answers 503 when the pool is down.
import { agentFetch } from "@/lib/agent";
import {
  DEFAULT_HOURS,
  bucketFor,
  buildTiles,
  cleanSeries,
  windowRange,
  type DailyRow,
  type LatestMap,
  type VitalPoint,
  type VitalsPayload,
} from "@/lib/vitals-math";

export type { VitalPoint, VitalsPayload } from "@/lib/vitals-math";

export type SeriesOptions = {
  metric?: "heart_rate";
  /** Window length in minutes. */
  windowMin?: number;
  /** Bucket size in minutes. */
  bucketMin?: number;
};

/** The agent answered with an error status. */
export class VitalsError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "VitalsError";
    this.status = status;
  }
}

async function agentJson(path: string, params: Record<string, string>): Promise<unknown> {
  const res = await agentFetch(`${path}?${new URLSearchParams(params).toString()}`);
  if (!res.ok) {
    let detail = `Agent answered ${res.status}.`;
    try {
      const body: unknown = await res.json();
      const d = (body as { detail?: unknown } | null)?.detail;
      if (typeof d === "string") detail = d;
    } catch {
      // Keep the default text.
    }
    throw new VitalsError(res.status, detail);
  }
  return res.json();
}

/**
 * Returns a series for the session user, oldest first. Returns [] when no data exists.
 * `userId` must come from the session. Never pass a user id from the client.
 * Throws VitalsError when the agent answers with an error, and AgentConfigError when it is not configured.
 */
export async function getSeries(
  userId: string,
  options: SeriesOptions = {},
): Promise<VitalPoint[]> {
  const { metric = "heart_rate", windowMin = DEFAULT_HOURS * 60, bucketMin = 1 } = options;
  const { from, to } = windowRange(new Date(), windowMin / 60);
  const raw = await agentJson("/vitals/series", {
    user_id: userId,
    metric,
    from,
    to,
    bucket: bucketFor(bucketMin),
  });
  return cleanSeries(raw);
}

/** The heart rate series plus the small tiles. A tile that fails to load is left out. */
export async function getVitalsPanel(
  userId: string,
  hours: number = DEFAULT_HOURS,
): Promise<VitalsPayload> {
  const [series, latest, daily] = await Promise.allSettled([
    getSeries(userId, { metric: "heart_rate", windowMin: hours * 60, bucketMin: 1 }),
    agentJson("/vitals/latest", { user_id: userId, metrics: "spo2,resting_heart_rate" }),
    agentJson("/vitals/daily", { user_id: userId, days: "1" }),
  ]);
  if (series.status === "rejected") throw series.reason;
  const latestMap =
    latest.status === "fulfilled" && latest.value && typeof latest.value === "object"
      ? (latest.value as LatestMap)
      : null;
  const dailyRows =
    daily.status === "fulfilled" && Array.isArray(daily.value) ? (daily.value as DailyRow[]) : null;
  return { series: series.value, tiles: buildTiles(latestMap, dailyRows) };
}
