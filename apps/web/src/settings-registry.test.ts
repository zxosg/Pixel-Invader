import { describe, expect, it } from "vitest";
import {
  SETTINGS_REGISTRY,
  createSettingsDraft,
  filterSettings,
  loadRegisteredValues,
  resetSettingsCategory,
  serializeSettingsByScope,
  SETTING_LEVELS,
  settingMatchesSearch,
  settingsForLevel,
  validateSettingsDraft,
} from "./settings-registry.js";

describe("settings registry", () => {
  it("has unique ids and searchable metadata", () => {
    const ids = SETTINGS_REGISTRY.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(settingMatchesSearch(SETTINGS_REGISTRY.find((item) => item.id === "mouseWheelZoom")!, "scroll")).toBe(true);
    expect(settingMatchesSearch(SETTINGS_REGISTRY.find((item) => item.id === "ditheringAmount")!, "DITHERINGAMOUNT")).toBe(true);
    expect(SETTINGS_REGISTRY.find((item) => item.id === "orderedMatrix")?.control.kind).toBe("select");
    expect(SETTINGS_REGISTRY.find((item) => item.id === "attributeHeight")?.control.kind).toBe("select");
    expect(SETTINGS_REGISTRY.find((item) => item.id === "gamma")?.control.kind).toBe("slider");
    expect(SETTINGS_REGISTRY.find((item) => item.id === "resampling")?.control.kind).toBe("select");
    expect(SETTINGS_REGISTRY.find((item) => item.id === "rotation")?.control.kind).toBe("select");
    expect(SETTINGS_REGISTRY.find((item) => item.id === "background")?.control.kind).toBe("color");
    expect(settingMatchesSearch(SETTINGS_REGISTRY.find((item) => item.id === "background")!, "RGB")).toBe(true);
    expect(SETTINGS_REGISTRY.find((item) => item.id === "paintMode")).toBeUndefined();
  });

  it("filters by category, preset, and modified values", () => {
    const values = createSettingsDraft({ ditheringAmount: 50, mouseWheelZoom: true });
    expect(filterSettings(SETTINGS_REGISTRY, "", "dithering", "all", values).map((item) => item.id)).toContain("ditheringAmount");
    expect(filterSettings(SETTINGS_REGISTRY, "", "all", "modified", values, createSettingsDraft({})).map((item) => item.id)).toEqual(["ditheringAmount"]);
    expect(filterSettings(SETTINGS_REGISTRY, "", "all", "workspace-mouse", values).map((item) => item.id)).toContain("mouseWheelZoom");
    expect(filterSettings(SETTINGS_REGISTRY, "", "startup", "all", values).map((item) => item.id)).toContain("workspaceLayout");
  });

  it("resets only the requested draft category", () => {
    const values = createSettingsDraft({ ditheringAmount: 50, brightness: 20, mouseWheelZoom: false });
    const reset = resetSettingsCategory(values, "dithering");
    expect(reset.ditheringAmount).toBe(100);
    expect(reset.brightness).toBe(20);
    expect(reset.mouseWheelZoom).toBe(false);
    expect(resetSettingsCategory(values, "all").brightness).toBe(0);
  });

  it("validates, scopes, and safely loads values", () => {
    const values = createSettingsDraft({ ditheringAmount: 101, unknown: "ignored" });
    const validation = validateSettingsDraft(values);
    expect(validation.errors.ditheringAmount).toBeDefined();
    expect(serializeSettingsByScope({ ...values, ditheringAmount: 30 }).application).toHaveProperty("mouseWheelZoom");
    expect(serializeSettingsByScope({ ...values, ditheringAmount: 30 }).conversion).toHaveProperty("ditheringAmount", 30);
    expect(loadRegisteredValues({ ditheringAmount: "bad", unknown: true }).ditheringAmount).toBe(100);
  });

  it("round-trips artistic pattern preferences and defaults older settings to auto", () => {
    for (const artisticPattern of ["auto", "checkerboard", "horizontal", "vertical"]) {
      const saved = serializeSettingsByScope(createSettingsDraft({ artisticPattern }));
      expect(loadRegisteredValues(saved.conversion).artisticPattern).toBe(artisticPattern);
    }
    expect(loadRegisteredValues({}).artisticPattern).toBe("auto");
    // Invalid persisted values are normalized to the safe, backward-compatible
    // default by the registry loader.
    expect(loadRegisteredValues({ artisticPattern: "invalid" }).artisticPattern).toBe("auto");
  });

  it("accepts a normal opened conversion draft", () => {
    const draft = createSettingsDraft({
      profileId: "org.retroconverter.zx48.default", presetId: "default", modeId: "zx48-standard-256x192",
      framing: "fit", resampling: "bilinear", rotation: 0, dithering: "none", ditheringAmount: 0,
      workspaceLayout: "conversion", synchronizePan: true, mouseWheelZoom: true, gamma: 100,
      attributeHeight: 8, orderedMatrix: "bayer-4x4",
    });
    expect(validateSettingsDraft(draft).errors).toEqual({});
  });

  it("round-trips RGB background colors", () => {
    const draft = createSettingsDraft({ background: { r: 12, g: 34, b: 56 } });
    expect(validateSettingsDraft(draft).errors).toEqual({});
    expect(loadRegisteredValues({ background: { r: 12, g: 34, b: 56 } }).background).toEqual({ r: 12, g: 34, b: 56 });
    expect(loadRegisteredValues({ background: { r: 300, g: 0, b: 0 } }).background).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("assigns every definition a tier with the intended Basic subset", () => {
    expect(SETTINGS_REGISTRY.every((item) => SETTING_LEVELS.includes(item.level))).toBe(true);
    const basic = SETTINGS_REGISTRY.filter((item) => item.level === "basic").map((item) => item.id).sort();
    expect(basic).toEqual([
      "brightness", "contrast", "dithering", "ditheringAmount", "framing",
      "modeId", "paletteSelections", "presetId", "profileId",
    ]);
    expect(SETTINGS_REGISTRY.find((item) => item.id === "developmentMode")?.level).toBe("expert");
    expect(SETTINGS_REGISTRY.find((item) => item.id === "saturation")?.level).toBe("advanced");
  });

  it("selects settings cumulatively by level and respects availability", () => {
    const basic = settingsForLevel("basic", { modeId: "zx48-standard-256x192" });
    const advanced = settingsForLevel("advanced", { modeId: "zx48-standard-256x192" });
    expect(basic.every((item) => item.level === "basic")).toBe(true);
    expect(advanced.length).toBeGreaterThan(basic.length);
    expect(advanced.every((item) => item.level !== "expert")).toBe(true);
    const zx = settingsForLevel("expert", { modeId: "zx48-standard-256x192" }).map((item) => item.id);
    const pmd = settingsForLevel("expert", { modeId: "pmd85-mode" }).map((item) => item.id);
    expect(zx).toContain("borderColor");
    expect(pmd).not.toContain("borderColor");
    expect(pmd).toContain("pmd85GapPolicy");
    expect(zx).not.toContain("pmd85GapPolicy");
  });
});
