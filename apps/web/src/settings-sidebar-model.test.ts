import { describe, expect, it } from "vitest";
import { sidebarSectionLevels, sidebarSettings } from "./settings-sidebar-model.js";

const ids = (level: "basic" | "advanced" | "expert", values: Record<string, unknown> = {}) =>
  sidebarSettings(level, values).map((definition) => definition.id);

describe("sidebarSettings", () => {
  it("grows with the tier and only lists conversion settings", () => {
    expect(ids("basic")).toContain("brightness");
    expect(ids("basic")).not.toContain("gamma");
    expect(ids("advanced")).toContain("gamma");
    expect(ids("advanced")).not.toContain("attributeOptimizerId");
    expect(ids("expert")).toContain("attributeOptimizerId");
    expect(ids("expert")).not.toContain("mouseWheelZoom");
    expect(ids("expert")).not.toContain("profileId");
  });

  it("always shows modified settings", () => {
    expect(ids("basic", { gamma: 140 })).toContain("gamma");
    expect(ids("basic", { gamma: 100 })).not.toContain("gamma");
  });
});

describe("sidebarSectionLevels", () => {
  it("uses the selected tier when nothing is modified", () => {
    expect(sidebarSectionLevels("basic", {})).toEqual({ geometry: "basic", adjustments: "basic", palette: "basic", dithering: "basic" });
  });
  it("raises only the section holding a modified higher-tier setting", () => {
    const levels = sidebarSectionLevels("basic", { gamma: 140 });
    expect(levels.adjustments).toBe("advanced");
    expect(levels.dithering).toBe("basic");
  });
  it("does not escalate for the derived dither engine id", () => {
    expect(sidebarSectionLevels("basic", { ditherEngineId: "custom-engine" }).dithering).toBe("basic");
  });
  it("accepts extra modified signals for unregistered adjustments", () => {
    expect(sidebarSectionLevels("basic", {}, { adjustments: "advanced" }).adjustments).toBe("advanced");
  });
});
