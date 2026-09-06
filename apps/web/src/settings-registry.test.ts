import { describe, expect, it } from "vitest";
import {
  SETTINGS_REGISTRY,
  createSettingsDraft,
  filterSettings,
  loadRegisteredValues,
  serializeSettingsByScope,
  settingMatchesSearch,
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
    expect(SETTINGS_REGISTRY.find((item) => item.id === "paintMode")?.description).toContain("Toggle");
  });

  it("filters by category, preset, and modified values", () => {
    const values = createSettingsDraft({ ditheringAmount: 50, mouseWheelZoom: true });
    expect(filterSettings(SETTINGS_REGISTRY, "", "dithering", "all", values).map((item) => item.id)).toContain("ditheringAmount");
    expect(filterSettings(SETTINGS_REGISTRY, "", "all", "modified", values).map((item) => item.id)).toEqual(["ditheringAmount"]);
    expect(filterSettings(SETTINGS_REGISTRY, "", "all", "workspace-mouse", values).map((item) => item.id)).toEqual(expect.arrayContaining(["workspaceLayout", "mouseWheelZoom"]));
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
      attributeHeight: 8, orderedMatrix: "bayer-4x4", paintMode: "toggle",
    });
    expect(validateSettingsDraft(draft).errors).toEqual({});
  });
});
