import { describe, expect, it } from "vitest";
import { BUILT_IN_PROFILE, PMD85_BUILT_IN_PROFILES } from "./profiles.js";
import { pmd85PaletteForResult } from "./result-palette.js";

describe("pmd85PaletteForResult", () => {
  it("resolves the PMD 85 palette from the result mode even when another platform is selected", () => {
    const pmd = PMD85_BUILT_IN_PROFILES[0]!;
    const modeId = Object.keys(pmd.palette.modes)[0]!;
    const palette = pmd85PaletteForResult([BUILT_IN_PROFILE, ...PMD85_BUILT_IN_PROFILES], BUILT_IN_PROFILE, modeId, "unknown-calibration");
    expect(palette.length).toBeGreaterThan(0);
  });

  it("returns an empty palette when no PMD 85 profile supports the mode", () => {
    expect(pmd85PaletteForResult([BUILT_IN_PROFILE], BUILT_IN_PROFILE, "nope", "x")).toEqual([]);
  });
});
