import type { StatusKind } from "@/components/ui-bits";

type Range = { match: RegExp; unit: string; low: number; high: number };

// Typical adult reference ranges. A bar shows only when the unit matches, so a mmol/L value never meets a mg/dL range.
const RANGES: Range[] = [
  { match: /\bhba1c\b|hemoglobin a1c|glycated hemoglobin/i, unit: "%", low: 4, high: 5.6 },
  { match: /\bldl\b/i, unit: "mg/dl", low: 0, high: 100 },
  { match: /\bhdl\b/i, unit: "mg/dl", low: 40, high: 100 },
  { match: /triglycerid/i, unit: "mg/dl", low: 0, high: 150 },
  { match: /^cholesterol \[|^cholesterol$|total cholesterol/i, unit: "mg/dl", low: 125, high: 200 },
  { match: /glucose/i, unit: "mg/dl", low: 70, high: 99 },
  { match: /creatinine/i, unit: "mg/dl", low: 0.6, high: 1.3 },
  { match: /glomerular|egfr/i, unit: "ml/min/{1.73_m2}", low: 60, high: 120 },
  { match: /ferritin/i, unit: "ng/ml", low: 20, high: 300 },
  { match: /potassium/i, unit: "mmol/l", low: 3.5, high: 5 },
  { match: /sodium/i, unit: "mmol/l", low: 135, high: 145 },
  { match: /\btsh\b|thyrotropin/i, unit: "m[iu]/l", low: 0.4, high: 4 },
  { match: /vitamin d/i, unit: "ng/ml", low: 30, high: 100 },
  { match: /^hemoglobin \[/i, unit: "g/dl", low: 12, high: 17.5 },
];

const cleanUnit = (u: string | null | undefined) => (u ?? "").toLowerCase().replace(/\s+/g, "");

export type LabRange = {
  low: number;
  high: number;
  status: StatusKind;
  /** Bar scale, wider than the range so a value outside it still has a place. */
  min: number;
  max: number;
};

/** "Cholesterol in LDL [Mass/volume] in Serum or Plasma" becomes "Cholesterol in LDL". */
export function shortLabName(display: string): string {
  return display.split(" [")[0].trim();
}

export function labRange(display: string, unit: string | null | undefined, value: number): LabRange | null {
  const r = RANGES.find((x) => x.match.test(display) && cleanUnit(unit) === x.unit);
  if (!r) return null;
  const span = r.high - r.low;
  const gap = value < r.low ? r.low - value : value > r.high ? value - r.high : 0;
  const status: StatusKind = gap === 0 ? "normal" : gap <= span * 0.1 ? "borderline" : "out_of_range";
  const min = Math.max(0, Math.min(r.low - span * 0.6, value - span * 0.1));
  const max = Math.max(r.high + span * 0.6, value + span * 0.1);
  return { low: r.low, high: r.high, status, min, max };
}
