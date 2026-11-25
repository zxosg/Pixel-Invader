import { describe, expect, it } from "vitest";
import { sidebarSettings } from "./settings-sidebar-model.js";

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
