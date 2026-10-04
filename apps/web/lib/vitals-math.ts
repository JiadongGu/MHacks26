// Pure vitals helpers. No I/O, so the browser, the server, and vitest can all import them.

export type VitalPoint = {
  /** ISO 8601 time. */
  ts: string;
  value: number;
};

export type TileKey = "steps" | "spo2" | "resting_heart_rate";

export type VitalTile = {
  key: TileKey;
  label: string;
  /** Display text, for example "7,412" or "97". */
  text: string;
  unit: string;
  /** ISO time of the reading, or null for a day total. */
  ts: string | null;
};

/** What /api/me/vitals returns and what the heart rate panel renders. */
export type VitalsPayload = {
  series: VitalPoint[];
  tiles: VitalTile[];
  /** Hours the series covers. Longer than asked when the recent window was empty. */
  hours?: number;
};

export type SeriesSummary = {
  current: VitalPoint;
  min: number;
  max: number;
  count: number;
};

export type LatestMap = Record<string, { ts: string; value: number }>;

export type DailyRow = {
  day: string;
  metric: string;
  avg: number | null;
  sum: number | null;
  n: number;
};

export const DEFAULT_HOURS = 3;
/** The live pool keeps 48 hours. The agent rejects a longer window. */
export const MAX_HOURS = 48;

/** Current value (the newest point), low, and high of a series. Returns null for an empty series. */
export function summarizeSeries(series: VitalPoint[]): SeriesSummary | null {
  if (series.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let current = series[0];
  for (const p of series) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
    if (new Date(p.ts).getTime() >= new Date(current.ts).getTime()) current = p;
  }
  return { current, min, max, count: series.length };
}

/** Reads the hours query value. It returns a whole number from 1 to 48, and the default for bad input. */
export function parseHours(raw: string | null | undefined, fallback = DEFAULT_HOURS): number {
  if (raw === null || raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_HOURS, Math.max(1, Math.floor(n)));
}

/** The from and to values for the agent. `to` is `now`. */
export function windowRange(now: Date, hours: number): { from: string; to: string } {
  const h = Math.min(MAX_HOURS, Math.max(1, hours));
  return {
    from: new Date(now.getTime() - h * 3_600_000).toISOString(),
    to: now.toISOString(),
  };
}

export type Bucket = "1m" | "1h" | "1d";

/** Maps a bucket size in minutes to the agent bucket name. */
export function bucketFor(bucketMin: number): Bucket {
  if (bucketMin >= 1440) return "1d";
  if (bucketMin >= 60) return "1h";
  return "1m";
}

/** Keeps only well-formed points, sorted oldest first. Guards the chart against a bad response. */
export function cleanSeries(raw: unknown): VitalPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: VitalPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { ts, value } = item as { ts?: unknown; value?: unknown };
    if (typeof ts !== "string" || Number.isNaN(new Date(ts).getTime())) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out.push({ ts, value });
  }
  return out.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

const TILE_META: Record<TileKey, { label: string; unit: string }> = {
  steps: { label: "Steps today", unit: "" },
  spo2: { label: "Blood oxygen", unit: "%" },
  resting_heart_rate: { label: "Resting heart rate", unit: "bpm" },
};

function tile(key: TileKey, value: number, ts: string | null): VitalTile {
  const meta = TILE_META[key];
  return {
    key,
    label: meta.label,
    text: Math.round(value).toLocaleString("en-US"),
    unit: meta.unit,
    ts,
  };
}

/**
 * Builds the small tiles. A tile with no reading is left out.
 * Steps come from the newest daily row. The other two use the latest reading, then the daily average.
 */
export function buildTiles(latest: LatestMap | null, daily: DailyRow[] | null): VitalTile[] {
  const tiles: VitalTile[] = [];
  const rows = daily ?? [];

  const stepRows = rows.filter((r) => r.metric === "steps" && typeof r.sum === "number" && r.n > 0);
  if (stepRows.length > 0) {
    const newest = stepRows.reduce((a, b) => (b.day > a.day ? b : a));
    if ((newest.sum as number) > 0) tiles.push(tile("steps", newest.sum as number, null));
  }

  const spo2 = latest?.spo2;
  if (spo2 && Number.isFinite(spo2.value) && spo2.value > 0) tiles.push(tile("spo2", spo2.value, spo2.ts));

  const rhr = latest?.resting_heart_rate;
  if (rhr && Number.isFinite(rhr.value) && rhr.value > 0) {
    tiles.push(tile("resting_heart_rate", rhr.value, rhr.ts));
  } else {
    const dayRows = rows.filter((r) => r.metric === "resting_heart_rate" && typeof r.avg === "number" && r.n > 0);
    if (dayRows.length > 0) {
      const newest = dayRows.reduce((a, b) => (b.day > a.day ? b : a));
      if ((newest.avg as number) > 0) tiles.push(tile("resting_heart_rate", newest.avg as number, null));
    }
  }
  return tiles;
}

/** True when the timestamp is more than `minutes` before `now`. */
export function isOlderThan(ts: string, now: Date, minutes: number): boolean {
  return now.getTime() - new Date(ts).getTime() > minutes * 60_000;
}
