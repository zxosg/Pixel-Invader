import { describe, expect, it } from "vitest";

import {
  draftPreviewResult,
  type RetainedDraftState,
} from "./draft-preview-state.js";

describe("retained Draft preview state", () => {
  const result = { width: 512, height: 256 };

  it.each(["scheduled", "running"] as const)(
    "retains the completed result while %s",
    (kind) => {
      const state: RetainedDraftState<typeof result> = {
        kind,
        retainedResult: result,
      };
      expect(draftPreviewResult(state)).toBe(result);
    },
  );

  it("uses the newly completed result atomically", () => {
    expect(draftPreviewResult({
      kind: "ready",
      result,
    })).toBe(result);
  });

  it("retains the previous result after a Draft failure", () => {
    expect(draftPreviewResult({
      kind: "error",
      message: "Conversion failed.",
      retainedResult: result,
    })).toBe(result);
  });

  it("returns no preview when idle or when no compatible result exists", () => {
    expect(draftPreviewResult({ kind: "idle" })).toBeNull();
    expect(draftPreviewResult({
      kind: "scheduled",
      retainedResult: null,
    })).toBeNull();
  });
});
