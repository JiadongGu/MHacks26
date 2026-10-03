// Typed reads of digital_twin.model (PLAN section 5.3). The model is jsonb, so every read is defensive.

export type TwinStatus = "normal" | "recovering" | "strained" | "possibly_ill";

export type TwinCondition = {
  code?: string | null;
  system?: string | null;
  display: string;
  status?: string | null;
  source?: string | null;
};
export type TwinMedication = { rxnorm?: string | null; display: string; class?: string | null };
export type TwinLab = {
  loinc?: string | null;
  display: string;
  value: number;
  unit?: string | null;
  date?: string | null;
};
export type TwinFamily = { relation: string; condition: string; source?: string | null };

export type TwinView = {
  status: TwinStatus | null;
  profile: Record<string, unknown>;
  conditions: TwinCondition[];
  medications: TwinMedication[];
  allergies: string[];
  familyHistory: TwinFamily[];
  labs: TwinLab[];
  baselines: Record<string, unknown>;
  baselineSources: Record<string, string>;
  thresholds: Record<string, unknown>;
  riskFlags: string[];
  insights: string[];
  provenance: Record<string, unknown>;
};

const STATUSES: TwinStatus[] = ["normal", "recovering", "strained", "possibly_ill"];

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function strings(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === "string");
}

export function readTwin(model: unknown): TwinView {
  const m = obj(model);
  const baselines = obj(m.baselines);
  const sources: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(baselines.sources))) {
    if (typeof v === "string") sources[k] = v;
  }
  const status = STATUSES.find((s) => s === m.status) ?? null;
  return {
    status,
    profile: obj(m.profile),
    conditions: arr(m.conditions).flatMap((c) => {
      const o = obj(c);
      const display = str(o.display);
      return display
        ? [{ code: str(o.code), system: str(o.system), display, status: str(o.status), source: str(o.source) }]
        : [];
    }),
    medications: arr(m.medications).flatMap((c) => {
      const o = obj(c);
      const display = str(o.display);
      return display ? [{ rxnorm: str(o.rxnorm), display, class: str(o.class) }] : [];
    }),
    allergies: strings(m.allergies),
    familyHistory: arr(m.family_history).flatMap((c) => {
      const o = obj(c);
      const relation = str(o.relation);
      const condition = str(o.condition);
      return relation && condition ? [{ relation, condition, source: str(o.source) }] : [];
    }),
    labs: arr(m.labs).flatMap((c) => {
      const o = obj(c);
      const display = str(o.display);
      return display && typeof o.value === "number"
        ? [{ loinc: str(o.loinc), display, value: o.value, unit: str(o.unit), date: str(o.date) }]
        : [];
    }),
    baselines,
    baselineSources: sources,
    thresholds: obj(m.thresholds),
    riskFlags: strings(m.risk_flags),
    insights: strings(m.insights),
    provenance: obj(m.provenance),
  };
}

export const STATUS_LABEL: Record<TwinStatus, string> = {
  normal: "Normal",
  recovering: "Recovering",
  strained: "Strained",
  possibly_ill: "Possibly ill",
};

/** Key a removal edit must send for a condition: code, else display. */
export function conditionKey(c: TwinCondition): string {
  return c.code ?? c.display;
}

/** Key a removal edit must send for a medication: rxnorm, else display. */
export function medicationKey(m: TwinMedication): string {
  return m.rxnorm ?? m.display;
}

export const BASELINE_LABEL: Record<string, { label: string; unit: string }> = {
  resting_hr: { label: "Resting heart rate", unit: "bpm" },
  hrv_sdnn: { label: "HRV (SDNN)", unit: "ms" },
  sleep_min: { label: "Sleep", unit: "min" },
  steps: { label: "Steps per day", unit: "steps" },
};

export function sourceLabel(source: string | undefined): string {
  switch (source) {
    case "daily_summary":
      return "Your wearable, 7-day median";
    case "finchnode":
      return "Your imported record";
    case "default":
      return "Population default";
    default:
      return source ?? "Unknown source";
  }
}
