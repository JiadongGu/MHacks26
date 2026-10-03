import { describe, expect, it } from "vitest";
import {
  cmFromFeetInches,
  feetInchesFromCm,
  formatHeight,
  formatWeight,
  kgFromLbs,
  lbsFromKg,
} from "@/lib/units";

describe("height", () => {
  it("converts feet and inches to centimetres", () => {
    expect(cmFromFeetInches(5, 6)).toBe(167.6);
    expect(cmFromFeetInches(6, 0)).toBe(182.9);
    expect(cmFromFeetInches(0, 0)).toBe(0);
  });
  it("converts centimetres to feet and inches, rolling 12 inches into a foot", () => {
    expect(feetInchesFromCm(168)).toEqual({ feet: 5, inches: 6 });
    expect(feetInchesFromCm(182.9)).toEqual({ feet: 6, inches: 0 });
    expect(feetInchesFromCm(30.5)).toEqual({ feet: 1, inches: 0 });
  });
  it("round trips every whole inch from 1 ft to 8 ft 6 in", () => {
    for (let total = 12; total <= 102; total++) {
      const feet = Math.floor(total / 12);
      const inches = total % 12;
      expect(feetInchesFromCm(cmFromFeetInches(feet, inches))).toEqual({ feet, inches });
    }
  });
  it("formats for display", () => {
    expect(formatHeight(168)).toBe("5 ft 6 in");
  });
});

describe("weight", () => {
  it("converts pounds to kilograms and back", () => {
    expect(kgFromLbs(150)).toBe(68);
    expect(lbsFromKg(68)).toBe(150);
    expect(kgFromLbs(0)).toBe(0);
  });
  it("round trips every whole pound the form accepts", () => {
    for (let lbs = 5; lbs <= 1100; lbs++) expect(lbsFromKg(kgFromLbs(lbs))).toBe(lbs);
  });
  it("formats for display", () => {
    expect(formatWeight(71)).toBe("157 lb");
  });
});
