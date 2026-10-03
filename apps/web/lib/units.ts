// US units for the forms. The app stores centimetres and kilograms; these convert at the edge.

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

export function cmFromFeetInches(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * CM_PER_INCH * 10) / 10;
}

export function feetInchesFromCm(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

export function kgFromLbs(lbs: number): number {
  return Math.round(lbs * KG_PER_LB * 10) / 10;
}

export function lbsFromKg(kg: number): number {
  return Math.round(kg / KG_PER_LB);
}

export function formatHeight(cm: number): string {
  const { feet, inches } = feetInchesFromCm(cm);
  return `${feet} ft ${inches} in`;
}

export function formatWeight(kg: number): string {
  return `${lbsFromKg(kg)} lb`;
}
