import { describe, expect, it } from "vitest";
import {
  ATTRIBUTE_OPTIMIZERS,
  DITHER_ENGINES,
  assertCompatibleEngines,
  ditherMethodForEngine,
  latestDitherEngineForMethod,
} from "./index.js";

describe("versioned conversion engines", () => {
  it("uses unique stable IDs", () => {
    expect(new Set(ATTRIBUTE_OPTIMIZERS.map(({ id }) => id)).size)
      .toBe(ATTRIBUTE_OPTIMIZERS.length);
    expect(new Set(DITHER_ENGINES.map(({ id }) => id)).size)
      .toBe(DITHER_ENGINES.length);
  });

  it("selects the newest registered engine for each basic method", () => {
    expect(latestDitherEngineForMethod("none")).toBe("none-discrete-v2");
    expect(latestDitherEngineForMethod("ordered"))
      .toBe("ordered-strict-matrix-v6");
    expect(latestDitherEngineForMethod("error-diffusion"))
      .toBe("error-diffusion-decorrelated-v3");
  });

  it("maps engine IDs to methods and validates platform support", () => {
    expect(ditherMethodForEngine("none-v1")).toBe("none");
    expect(ditherMethodForEngine("none-discrete-v2")).toBe("none");
    expect(ditherMethodForEngine("vertical-spatial-none-v1")).toBe("none");
    expect(ditherMethodForEngine("vertical-spatial-ordered-v1")).toBe("ordered");
    expect(ditherMethodForEngine("vertical-spatial-error-diffusion-v1"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("ordered-osg-v1")).toBe("ordered");
    expect(ditherMethodForEngine("ordered-unrestricted-v2")).toBe("ordered");
    expect(ditherMethodForEngine("ordered-palette-pairs-v4")).toBe("ordered");
    expect(ditherMethodForEngine("ordered-baseline-additive-v5"))
      .toBe("ordered");
    expect(ditherMethodForEngine("ordered-strict-matrix-v6"))
      .toBe("ordered");
    expect(ditherMethodForEngine("ordered-coverage-normalized-v7"))
      .toBe("ordered");
    expect(ditherMethodForEngine("ordered-mixed-phase-stable-v8"))
      .toBe("ordered");
    expect(ditherMethodForEngine("ordered-clustered-dot-v1"))
      .toBe("ordered");
    expect(ditherMethodForEngine("ordered-void-cluster-v1"))
      .toBe("ordered");
    expect(ditherMethodForEngine("error-diffusion-unrestricted-v2"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-decorrelated-v3"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-atkinson-v1"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-riemersma-v1"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-phase-balanced-v3"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-phase-balanced-checker-v3-1"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-phase-balanced-checker-v3-2"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-phase-balanced-checker-v3-3"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-checker-phase-v4"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-checker-phase-v4-4"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-checker-phase-v4-1"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-checker-phase-v4-2"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-checker-phase-v4-3"))
      .toBe("error-diffusion");
    expect(ditherMethodForEngine("error-diffusion-checker-phase-v5"))
      .toBe("error-diffusion");
    expect(() => assertCompatibleEngines(
      "sinclair-ql",
      "zx-adaptive-v1",
      "error-diffusion-projected-v1",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-structured-global-v1",
      "ordered-cell-pattern-v1",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-structured-global-v2",
      "ordered-cell-pattern-v2",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-structured-global-v3",
      "ordered-cell-pattern-v3",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-structured-global-v4",
      "ordered-cell-pattern-v4",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-block-dbs-global-v1",
      "pattern-legal-mask-dbs-v1",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "pmd-85",
      "pmd85-vertical-spatial-uniform-v1",
      "vertical-spatial-ordered-v1",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "sinclair-ql",
      "ql-vertical-spatial-uniform-v1",
      "vertical-spatial-error-diffusion-v1",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "sinclair-ql",
      "zx-adaptive-v1",
      "error-diffusion-checker-phase-v4-4",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "pmd-85",
      "pmd85-cell-v1",
      "error-diffusion-checker-phase-v4-4",
    )).not.toThrow();
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-guide-reference-halo-v1",
      "vertical-spatial-ordered-v1",
    )).toThrow(/incompatible/);
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-structured-global-v1",
      "ordered-strict-matrix-v6",
    )).toThrow(/incompatible/);
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-guide-reference-halo-v1",
      "ordered-cell-pattern-v1",
    )).toThrow(/incompatible/);
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-structured-global-v1",
      "ordered-cell-pattern-v2",
    )).toThrow(/incompatible/);
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-structured-global-v2",
      "ordered-cell-pattern-v3",
    )).toThrow(/incompatible/);
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-structured-global-v3",
      "ordered-cell-pattern-v4",
    )).toThrow(/incompatible/);
    expect(() => assertCompatibleEngines(
      "zx-spectrum",
      "zx-block-dbs-global-v1",
      "ordered-cell-pattern-v4",
    )).toThrow(/incompatible/);
  });

  it("scopes the phase-stable ordered engine to ZX mixed mode", () => {
    const engine = DITHER_ENGINES.find(({ id }) =>
      id === "ordered-mixed-phase-stable-v8"
    );
    expect(engine?.lifecycle).toBe("promoted");
    expect(engine?.targetModeIds).toEqual(["zx48-mixed-256x192"]);
  });

  it("keeps research engines explicitly benchmark-only", () => {
    expect(ATTRIBUTE_OPTIMIZERS.find(({ id }) =>
      id === "zx-block-dbs-global-v1"
    )?.lifecycle).toBe("experimental");
    expect(DITHER_ENGINES.find(({ id }) =>
      id === "pattern-legal-mask-dbs-v1"
    )?.lifecycle).toBe("experimental");
    expect(DITHER_ENGINES.filter(({ lifecycle }) =>
      lifecycle === "experimental"
    ).map(({ id }) => id)).toEqual(expect.arrayContaining([
      "ordered-clustered-dot-v1",
      "ordered-void-cluster-v1",
      "ordered-coverage-normalized-v7",
      "error-diffusion-atkinson-v1",
      "error-diffusion-riemersma-v1",
      "error-diffusion-phase-balanced-v3",
      "error-diffusion-phase-balanced-checker-v3-1",
      "error-diffusion-phase-balanced-checker-v3-2",
      "error-diffusion-phase-balanced-checker-v3-3",
      "error-diffusion-checker-phase-v4",
      "error-diffusion-checker-phase-v4-4",
      "error-diffusion-checker-phase-v4-1",
      "error-diffusion-checker-phase-v4-2",
      "error-diffusion-checker-phase-v4-3",
      "error-diffusion-checker-phase-v5",
      "error-diffusion-matrix-guided-v1",
    ]));
    expect(ATTRIBUTE_OPTIMIZERS.find(({ id }) =>
      id === "zx-guide-reference-rgb-halo-v3"
    )?.lifecycle).toBe("experimental");
  });
});
