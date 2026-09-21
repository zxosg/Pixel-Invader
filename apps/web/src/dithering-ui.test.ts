import { describe, expect, it } from "vitest";
import { composerMixOptions } from "./dithering-ui.js";

describe("composer mix options", () => {
  it("exposes the fixed quarter-step options", () => {
    expect(composerMixOptions(50).map((option) => option.label)).toEqual([
      "0%",
      "25%",
      "50%",
      "75%",
      "100%",
    ]);
  });

  it("keeps a legacy arbitrary value visible without making it selectable", () => {
    expect(composerMixOptions(62)[0]).toEqual({
      value: "62",
      label: "Current · 62%",
      disabled: true,
    });
  });

  it("does not add a custom option for a fixed value", () => {
    expect(composerMixOptions(0)).toHaveLength(5);
    expect(composerMixOptions(100)).toHaveLength(5);
  });
});
