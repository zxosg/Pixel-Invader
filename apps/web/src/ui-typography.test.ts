import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_TYPOGRAPHY,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  loadUiTypographySettings,
  uiTypographyCssVariables,
  validateUiTypographySettings,
} from "./ui-typography.js";

describe("UI typography settings", () => {
  it("provides bounded defaults for the three UI roles", () => {
    expect(DEFAULT_UI_TYPOGRAPHY).toMatchObject({
      windowTitleFontWeight: "bold",
      uiLabelFontWeight: "bold",
      uiBodyFontWeight: "normal",
    });
    expect(DEFAULT_UI_TYPOGRAPHY.windowTitleFontSize).toBeGreaterThanOrEqual(UI_FONT_SIZE_MIN);
    expect(DEFAULT_UI_TYPOGRAPHY.uiBodyFontSize).toBeLessThanOrEqual(UI_FONT_SIZE_MAX);
    expect(validateUiTypographySettings(DEFAULT_UI_TYPOGRAPHY)).toEqual(DEFAULT_UI_TYPOGRAPHY);
  });

  it("keeps valid fields while falling back invalid or legacy fields", () => {
    expect(loadUiTypographySettings({
      uiFontFamily: "system",
      windowTitleFontSize: 18,
      windowTitleFontWeight: "normal",
      uiLabelFontSize: 100,
      uiLabelFontWeight: "heavy",
      uiBodyFontSize: 13,
      uiBodyFontWeight: "bold",
    })).toEqual({
      ...DEFAULT_UI_TYPOGRAPHY,
      uiFontFamily: "system",
      windowTitleFontSize: 18,
      windowTitleFontWeight: "normal",
      uiBodyFontSize: 13,
      uiBodyFontWeight: "bold",
    });
  });

  it("allows font sizes down to 6px", () => {
    const smallTypography = {
      ...DEFAULT_UI_TYPOGRAPHY,
      windowTitleFontSize: 6,
      uiLabelFontSize: 6,
      uiBodyFontSize: 6,
    };
    expect(validateUiTypographySettings(smallTypography)).toEqual(smallTypography);
    expect(loadUiTypographySettings({ ...smallTypography, uiBodyFontSize: 5 }).uiBodyFontSize)
      .toBe(DEFAULT_UI_TYPOGRAPHY.uiBodyFontSize);
  });

  it("maps settings to CSS variables used by the live preview and shell", () => {
    expect(uiTypographyCssVariables({
      ...DEFAULT_UI_TYPOGRAPHY,
      uiFontFamily: "system",
      windowTitleFontSize: 16,
      windowTitleFontWeight: "normal",
      uiLabelFontSize: 14,
      uiLabelFontWeight: "bold",
      uiBodyFontSize: 12,
      uiBodyFontWeight: "bold",
    })).toMatchObject({
      "--ui-title-font-size": "16px",
      "--ui-title-font-weight": "400",
      "--ui-label-font-size": "14px",
      "--ui-label-font-weight": "700",
      "--ui-body-font-size": "12px",
      "--ui-body-font-weight": "700",
    });
  });
});
