import { describe, expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate";
import { DEFAULT_CONVERSION_SETTINGS } from "@retro-converter/conversion-core";
import { encodeRgbaPng } from "@retro-converter/image-codecs";
import { createBlankScreen, serializeScr } from "@retro-converter/zx-spectrum";
import { encodeQlScreen } from "@retro-converter/sinclair-ql";
import { PMD85_VRAM_BYTES } from "@retro-converter/pmd-85";
import { createCompletedProject, validateCompletedProject } from "./projects.js";
import { BUILT_IN_PROFILE, PMD85_BUILT_IN_PROFILES, QL_BUILT_IN_PROFILE } from "./profiles.js";
import { sha256Hex } from "./artifacts.js";

const projectEncoder = new TextEncoder();
const projectDecoder = new TextDecoder();

async function asLegacySchema10(project: Uint8Array): Promise<Uint8Array> {
  const files = unzipSync(project);
  files["artifacts/result.scr"] = files["artifacts/screen-1.bin"]!;
  delete files["artifacts/screen-1.bin"];
  if (files["artifacts/screen-2.bin"] !== undefined) {
    files["artifacts/result-screen-2.scr"] = files["artifacts/screen-2.bin"]!;
    delete files["artifacts/screen-2.bin"];
  }
  const settings = JSON.parse(projectDecoder.decode(files["settings/conversion.json"]));
  settings.schema_version = "10.0.0";
  files["settings/conversion.json"] = projectEncoder.encode(`${JSON.stringify(settings, null, 2)}\n`);
  delete files["manifest.json"];
  delete files["integrity/sha256.json"];
  const integrityEntries: Record<string, string> = {};
  for (const path of Object.keys(files).sort()) {
    integrityEntries[path] = await sha256Hex(files[path]!);
  }
  files["integrity/sha256.json"] = projectEncoder.encode(`${JSON.stringify({
    algorithm: "SHA-256",
    entries: integrityEntries,
  }, null, 2)}\n`);
  const entries = await Promise.all(Object.keys(files).sort().map(async (path) => ({
    path,
    media_type: "application/octet-stream",
    role: "legacy-artifact",
    size: files[path]!.length,
    sha256: await sha256Hex(files[path]!),
  })));
  const selfEntry = {
    path: "manifest.json",
    media_type: "application/json",
    role: "manifest",
    size: 0,
    sha256: "self-projection",
  };
  const manifest = {
    schema_version: "10.0.0",
    application_version: "1.0.0-draft.3",
    entries: [selfEntry, ...entries],
  };
  let manifestBytes = projectEncoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  while (selfEntry.size !== manifestBytes.length) {
    selfEntry.size = manifestBytes.length;
    manifestBytes = projectEncoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  }
  files["manifest.json"] = manifestBytes;
  return Uint8Array.from(zipSync(files, {
    level: 0,
    mtime: new Date("1980-01-01T00:00:00Z"),
  }));
}

function projectInput() {
  return {
    sourceBytes: encodeRgbaPng(Uint8Array.from([1, 2, 3, 255]), 1, 1),
    sourceFormat: "png" as const,
    settings: DEFAULT_CONVERSION_SETTINGS,
    scr: serializeScr(createBlankScreen(0)),
    previewPng: encodeRgbaPng(new Uint8Array(256 * 192 * 4), 256, 192),
    metadataJson: new TextEncoder().encode("{\"schema_version\":\"1.0.0\"}\n"),
    profile: BUILT_IN_PROFILE,
  };
}

describe("completed project containers", () => {
  it("writes platform-neutral PMD schema-11 artifacts and preserves direct imports", async () => {
    const original = new Uint8Array(PMD85_VRAM_BYTES);
    original[0] = 0x81;
    original[48] = 0xa5;
    const profile = PMD85_BUILT_IN_PROFILES[0]!;
    const settings = {
      ...profile.presets[0]!.settings,
      modeId: "pmd85-2-tv" as const,
      attributeHeight: 1 as const,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 1] }],
      pmd85: {
        ...profile.presets[0]!.settings.pmd85,
        mode: "pmd85-2-tv" as const,
        paletteCalibrationId: "neutral-white",
        gapPolicy: "preserve-imported" as const,
      },
    };
    const project = await createCompletedProject({
      sourceBytes: original,
      sourceFormat: "pmd85-bin",
      resultOrigin: "direct-import",
      settings,
      scr: original,
      previewPng: encodeRgbaPng(new Uint8Array(288 * 256 * 4), 288, 256),
      metadataJson: new TextEncoder().encode("{\"schema_version\":\"3.0.0\"}\n"),
      profile,
    });
    const files = unzipSync(project);
    expect(files["source/original.bin"]).toEqual(original);
    expect(files["artifacts/screen-1.bin"]).toEqual(original);
    expect(files["artifacts/result.scr"]).toBeUndefined();
    const validated = await validateCompletedProject(project);
    expect(validated.sourceFormat).toBe("pmd85-bin");
    expect(validated.resultOrigin).toBe("direct-import");
    expect(validated.scr).toEqual(original);
    expect(validated.settings.modeId).toBe("pmd85-2-tv");
  });

  it("creates deterministic palette projects and validates their contents", async () => {
    const first = await createCompletedProject(projectInput());
    const second = await createCompletedProject(projectInput());
    expect(first).toEqual(second);
    const validated = await validateCompletedProject(first);
    expect(validated.manifest.schema_version).toBe("13.0.0");
    expect(validated.sourcePath).toBe("source/original.png");
    expect(validated.settings).toEqual(DEFAULT_CONVERSION_SETTINGS);
    expect(validated.scr).toEqual(projectInput().scr);
    expect(Object.keys(unzipSync(first))).toHaveLength(9);
  });

  it("round-trips an optional edited working source", async () => {
    const workingSourcePng = encodeRgbaPng(
      Uint8Array.from([255, 0, 0, 255]),
      1,
      1,
    );
    const project = await createCompletedProject({
      ...projectInput(),
      workingSourcePng,
    });
    const files = unzipSync(project);
    expect(files["source/working.png"]).toEqual(workingSourcePng);
    const validated = await validateCompletedProject(project);
    expect(validated.workingSourcePng).toEqual(workingSourcePng);
  });

  it("round-trips schema-12 vertical spatial settings as one hardware frame", async () => {
    const screen = encodeQlScreen(new Uint8Array(256 * 256), "mode8-256x256");
    const baselineSettings = QL_BUILT_IN_PROFILE.presets.find(
      (preset) => preset.id === "vertical-spatial-mode8-v1",
    )!.settings;
    const settings = {
      ...baselineSettings,
      ditherEngineId: "vertical-spatial-ordered-v1" as const,
      dithering: "ordered" as const,
      ditheringAmount: 75,
      orderedMatrix: "bayer-4x4" as const,
    };
    const project = await createCompletedProject({
      sourceBytes: encodeRgbaPng(Uint8Array.from([0, 0, 0, 255]), 1, 1),
      sourceFormat: "png",
      settings,
      scr: screen,
      frames: [screen],
      previewPng: encodeRgbaPng(new Uint8Array(256 * 128 * 4), 256, 128),
      metadataJson: projectEncoder.encode("{\"schema_version\":\"4.0.0\"}\n"),
      profile: QL_BUILT_IN_PROFILE,
    });
    const validated = await validateCompletedProject(project);
    expect(validated.manifest.schema_version).toBe("13.0.0");
    expect(validated.settings).toEqual(settings);
    expect(validated.frames).toEqual([screen]);
  });

  it("round-trips the experimental ZX detail-preserving spatial optimizer", async () => {
    const screen = new Uint8Array(12_288);
    const settings = BUILT_IN_PROFILE.presets.find(
      (preset) => preset.id === "vertical-spatial-detail-v1",
    )!.settings;
    const project = await createCompletedProject({
      sourceBytes: encodeRgbaPng(Uint8Array.from([0, 0, 0, 255]), 1, 1),
      sourceFormat: "png",
      settings,
      scr: screen,
      frames: [screen],
      previewPng: encodeRgbaPng(new Uint8Array(256 * 96 * 4), 256, 96),
      metadataJson: projectEncoder.encode("{\"schema_version\":\"4.0.0\"}\n"),
      profile: BUILT_IN_PROFILE,
    });
    const validated = await validateCompletedProject(project);
    expect(validated.settings.attributeOptimizerId)
      .toBe("zx-vertical-spatial-detail-v1");
    expect(validated.settings.verticalSpatialMix?.algorithmId)
      .toBe("vertical-spatial-detail-v1");
  });

  it("adapts schema-10 .scr entries into the generic artifact model", async () => {
    const legacy = await asLegacySchema10(await createCompletedProject(projectInput()));
    const validated = await validateCompletedProject(legacy);
    expect(validated.manifest.schema_version).toBe("10.0.0");
    expect(validated.scr).toEqual(projectInput().scr);
    expect(validated.frames).toEqual([projectInput().scr]);
    expect(validated.resultOrigin).toBe("converted");
  });

  it("round-trips the integrated tilemap stage", async () => {
    const tilemap = {
      settings: {
        source: "derived" as const,
        characterBudget: 1,
        encoding: "compact" as const,
        allowTransforms: false,
        allowPolarity: true,
        derivedStrategy: "image-similarity-v2" as const,
        distanceMetric: "image-similarity-v2" as const,
        visualWeighting: true,
        swapRefinementPasses: 4,
      },
      artifact: new Uint8Array(768 + 768 + 8),
      previewPng: encodeRgbaPng(
        new Uint8Array(256 * 192 * 4),
        256,
        192,
      ),
      diagnostics: {
        uniqueCanonicalTiles: 1,
        usedCharacterCount: 1,
        exactMatches: 768,
        averageStructuralError: 0,
        maximumStructuralError: 0,
        rgbSquaredError: 0,
        rgbRmse: 0,
        rgbSimilarityPercent: 100,
        polaritySwaps: 0,
        transformHistogram: [768, 0, 0, 0, 0, 0, 0, 0],
        memory: {
          tilemapBytes: 768,
          attributeBytes: 768,
          transformBytes: 0,
          charsetBytes: 8,
          totalBytes: 1544,
        },
      },
      assignments: Array.from({ length: 768 }, () => ({
        characterIndex: 0,
        transform: 0 as const,
        inverted: false,
        distance: 0,
        hamming: 0,
      })),
      charset: new Uint8Array(8),
      sourceCharset: new Uint8Array(8),
    };
    const project = await createCompletedProject({
      ...projectInput(),
      workspaceMode: "tilemap",
      tilemap,
    });
    expect(Object.keys(unzipSync(project))).toHaveLength(15);
    const validated = await validateCompletedProject(project);
    expect(validated.workspaceMode).toBe("tilemap");
    expect(validated.tilemap?.artifact).toEqual(tilemap.artifact);
    expect(validated.tilemap?.settings).toEqual(tilemap.settings);
    expect(validated.tilemap?.sourceCharset).toEqual(tilemap.sourceCharset);
  });

  it("persists a complete loaded charset separately from its active range", async () => {
    const sourceCharset = Uint8Array.from(
      { length: 64 * 8 },
      (_, index) => (index * 29 + 7) & 0xff,
    );
    const settings = {
      source: "existing" as const,
      existingCharsetRange: { startIndex: 8, length: 40 },
      existingCharsetSelection: { indices: [8, 10, 47] },
      characterBudget: 3,
      encoding: "extended" as const,
      allowTransforms: true,
      allowPolarity: true,
      derivedStrategy: "best-coverage" as const,
      distanceMetric: "hybrid" as const,
      visualWeighting: false,
      swapRefinementPasses: 1,
    };
    const tilemap = {
      settings,
      artifact: new Uint8Array(768 + 768 + 288 + 40 * 8),
      previewPng: encodeRgbaPng(
        new Uint8Array(256 * 192 * 4),
        256,
        192,
      ),
      diagnostics: {
        uniqueCanonicalTiles: 1,
        usedCharacterCount: 1,
        exactMatches: 0,
        averageStructuralError: 0,
        maximumStructuralError: 0,
        rgbSquaredError: 0,
        rgbRmse: 0,
        rgbSimilarityPercent: 100,
        polaritySwaps: 0,
        transformHistogram: [768, 0, 0, 0, 0, 0, 0, 0],
        memory: {
          tilemapBytes: 768,
          attributeBytes: 768,
          transformBytes: 288,
          charsetBytes: 320,
          totalBytes: 2144,
        },
      },
      assignments: Array.from({ length: 768 }, () => ({
        characterIndex: 0,
        transform: 0 as const,
        inverted: false,
        distance: 0,
        hamming: 0,
      })),
      charset: Uint8Array.from([
        ...sourceCharset.slice(8 * 8, 9 * 8),
        ...sourceCharset.slice(10 * 8, 11 * 8),
        ...sourceCharset.slice(47 * 8, 48 * 8),
      ]),
      sourceCharset,
    };
    const validated = await validateCompletedProject(
      await createCompletedProject({
        ...projectInput(),
        workspaceMode: "tilemap",
        tilemap,
      }),
    );
    expect(validated.tilemap?.sourceCharset).toEqual(sourceCharset);
    expect(validated.tilemap?.charset).toEqual(tilemap.charset);
    expect(validated.tilemap?.settings.existingCharsetRange).toEqual({
      startIndex: 8,
      length: 40,
    });
    expect(validated.tilemap?.settings.existingCharsetSelection).toEqual({
      indices: [8, 10, 47],
    });
  });

  it("round-trips explicit coupled structured-engine settings", async () => {
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      attributeOptimizerId: "zx-structured-global-v1" as const,
      ditherEngineId: "ordered-cell-pattern-v1" as const,
      dithering: "ordered" as const,
      ditheringAmount: 37,
      structured: {
        ...DEFAULT_CONVERSION_SETTINGS.structured,
        ditherAmountPermille: 370,
      },
    };
    const project = await createCompletedProject({
      ...projectInput(),
      settings,
    });
    const validated = await validateCompletedProject(project);

    expect(validated.settings).toEqual(settings);
    expect(validated.manifest.schema_version).toBe("13.0.0");
  });

  it("round-trips Halo v2 influence and the experimental legal-mask engine", async () => {
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      attributeOptimizerId: "zx-block-dbs-global-v1" as const,
      ditherEngineId: "pattern-legal-mask-dbs-v1" as const,
      dithering: "ordered" as const,
      ditheringAmount: 60,
      attributeHaloInfluence: 300,
    };
    const project = await createCompletedProject({
      ...projectInput(),
      settings,
    });
    const validated = await validateCompletedProject(project);
    expect(validated.settings).toEqual(settings);
  });

  it("round-trips the mixture-balanced structured Version 2 pair", async () => {
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      attributeOptimizerId: "zx-structured-global-v2" as const,
      ditherEngineId: "ordered-cell-pattern-v2" as const,
      dithering: "ordered" as const,
      ditheringAmount: 4,
      structured: {
        ...DEFAULT_CONVERSION_SETTINGS.structured,
        ditherAmountPermille: 40,
        ditherResponseCurveId: "power-035-percent-v2" as const,
        objectiveWeights: {
          ...DEFAULT_CONVERSION_SETTINGS.structured.objectiveWeights,
          pixel: 192,
          rgbAnchor: 0,
          mean: 2048,
        },
      },
    };
    const project = await createCompletedProject({
      ...projectInput(),
      settings,
    });
    const validated = await validateCompletedProject(project);

    expect(validated.settings).toEqual(settings);
    expect(validated.manifest.schema_version).toBe("13.0.0");
  });

  it("round-trips the source-color-balanced structured Version 3 pair", async () => {
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      attributeOptimizerId: "zx-structured-global-v3" as const,
      ditherEngineId: "ordered-cell-pattern-v3" as const,
      dithering: "ordered" as const,
      ditheringAmount: 50,
      structured: {
        ...DEFAULT_CONVERSION_SETTINGS.structured,
        ditherAmountPermille: 500,
        ditherResponseCurveId: "power-035-percent-v2" as const,
        colorAnchorModelId: "srgb-squared-v1" as const,
        objectiveWeights: {
          ...DEFAULT_CONVERSION_SETTINGS.structured.objectiveWeights,
          pixel: 192,
          rgbAnchor: 6144,
          mean: 2048,
        },
      },
    };
    const project = await createCompletedProject({
      ...projectInput(),
      settings,
    });
    const validated = await validateCompletedProject(project);

    expect(validated.settings).toEqual(settings);
    expect(validated.manifest.schema_version).toBe("13.0.0");
  });

  it("round-trips the topology-preserving structured Version 4 pair", async () => {
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      attributeOptimizerId: "zx-structured-global-v4" as const,
      ditherEngineId: "ordered-cell-pattern-v4" as const,
      dithering: "ordered" as const,
      ditheringAmount: 50,
      structured: {
        ...DEFAULT_CONVERSION_SETTINGS.structured,
        ditherAmountPermille: 500,
        ditherResponseCurveId: "power-035-percent-v2" as const,
        colorAnchorModelId: "srgb-squared-v1" as const,
        structuralModelId: "palette-topology-v1" as const,
        objectiveWeights: {
          ...DEFAULT_CONVERSION_SETTINGS.structured.objectiveWeights,
          pixel: 192,
          rgbAnchor: 2048,
          patternReference: 1536,
          paletteDistribution: 1024,
          luminanceRank: 512,
          edgePolarity: 768,
          mean: 768,
          sharedEndpoint: 0,
        },
        candidateParameters: {
          ...DEFAULT_CONVERSION_SETTINGS.structured.candidateParameters,
          localAdmissibilityPermille: 100,
          boundaryCapPermille: 100,
        },
      },
    };
    const project = await createCompletedProject({
      ...projectInput(),
      settings,
    });
    const validated = await validateCompletedProject(project);

    expect(validated.settings).toEqual(settings);
    expect(validated.manifest.schema_version).toBe("13.0.0");
  });

  it("round-trips non-neutral filters and attribute smoothing", async () => {
    const input = {
      ...projectInput(),
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        smoothing: 35,
        sharpening: 72,
        attributeSmoothing: 48,
        attributeHaloHorizontal: 2 as const,
        attributeHaloVertical: 1 as const,
        errorDiffusionRandomization: 37,
      },
    };
    const validated = await validateCompletedProject(
      await createCompletedProject(input),
    );
    expect(validated.settings.smoothing).toBe(35);
    expect(validated.settings.sharpening).toBe(72);
    expect(validated.settings.attributeSmoothing).toBe(48);
    expect(validated.settings.attributeHaloHorizontal).toBe(2);
    expect(validated.settings.attributeHaloVertical).toBe(1);
    expect(validated.settings.errorDiffusionRandomization).toBe(37);
  });

  it("stores and validates both Sinclair QL hardware screens", async () => {
    const first = encodeQlScreen(
      new Uint8Array(256 * 256),
      "mode8-256x256",
    );
    const secondPixels = new Uint8Array(256 * 256);
    secondPixels.fill(7);
    const second = encodeQlScreen(secondPixels, "mode8-256x256");
    const input = {
      ...projectInput(),
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        profileId: "org.retroconverter.sinclair-ql.default",
        platformId: "sinclair-ql" as const,
        modeId: "mode8-256x256" as const,
        paletteSelections: [
          { screenIndex: 0, enabledColorIds: [0, 4] },
          { screenIndex: 1, enabledColorIds: [3, 7] },
        ],
      },
      scr: first,
      frames: [first, second],
    };
    const project = await createCompletedProject(input);
    expect(Object.keys(unzipSync(project))).toHaveLength(10);
    const validated = await validateCompletedProject(project);
    expect(validated.frames).toEqual([first, second]);
  });

  it("stores and validates heterogeneous QL Low/High screens", async () => {
    const low = encodeQlScreen(
      new Uint8Array(256 * 256),
      "mode8-256x256",
    );
    const high = encodeQlScreen(
      new Uint8Array(512 * 256),
      "mode4-512x256",
    );
    const input = {
      ...projectInput(),
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        profileId: "org.retroconverter.sinclair-ql.default",
        platformId: "sinclair-ql" as const,
        modeId: "mode8-mode4-mixed-512x256" as const,
        paletteSelections: [
          { screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] },
          { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
        ],
      },
      scr: low,
      frames: [low, high],
      previewPng: encodeRgbaPng(
        new Uint8Array(512 * 256 * 4),
        512,
        256,
      ),
    };
    const validated = await validateCompletedProject(
      await createCompletedProject(input),
    );
    expect(validated.settings.modeId)
      .toBe("mode8-mode4-mixed-512x256");
    expect(validated.frames).toEqual([low, high]);
  });

  it("stores and validates both mixed ZX hardware screens", async () => {
    const first = serializeScr(createBlankScreen(0));
    const second = serializeScr(createBlankScreen(0x47));
    const input = {
      ...projectInput(),
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        modeId: "zx48-mixed-256x192" as const,
        paletteSelections: [
          { screenIndex: 0, enabledColorIds: [0, 2], brightMode: "off" as const },
          { screenIndex: 1, enabledColorIds: [4, 6], brightMode: "on" as const },
        ],
      },
      scr: first,
      frames: [first, second],
    };
    const project = await createCompletedProject(input);
    expect(Object.keys(unzipSync(project))).toHaveLength(10);
    const validated = await validateCompletedProject(project);
    expect(validated.settings.modeId).toBe("zx48-mixed-256x192");
    expect(validated.settings.paletteSelections).toEqual(input.settings.paletteSelections);
    expect(validated.frames).toEqual([first, second]);
  });

  it("stores a plain Sinclair QL project with one hardware screen", async () => {
    const screen = encodeQlScreen(
      new Uint8Array(512 * 256),
      "mode4-512x256",
    );
    const input = {
      ...projectInput(),
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        profileId: "org.retroconverter.sinclair-ql.default",
        platformId: "sinclair-ql" as const,
        modeId: "mode4-plain-512x256" as const,
        paletteSelections: [{
          screenIndex: 0,
          enabledColorIds: [0, 1, 2, 3],
        }],
      },
      scr: screen,
      frames: [screen],
      previewPng: encodeRgbaPng(
        new Uint8Array(512 * 256 * 4),
        512,
        256,
      ),
    };
    const project = await createCompletedProject(input);
    expect(Object.keys(unzipSync(project))).toHaveLength(9);
    const validated = await validateCompletedProject(project);
    expect(validated.settings.modeId).toBe("mode4-plain-512x256");
    expect(validated.frames).toEqual([screen]);
  });

  it("rejects content whose declared hash no longer matches", async () => {
    const files = unzipSync(await createCompletedProject(projectInput()));
    const changed = Uint8Array.from(files["artifacts/screen-1.bin"] ?? new Uint8Array());
    changed[0] = (changed[0] ?? 0) ^ 1;
    files["artifacts/screen-1.bin"] = changed;
    const tampered = zipSync(files, { level: 0, mtime: new Date("1980-01-01T00:00:00Z") });
    await expect(validateCompletedProject(tampered)).rejects.toThrow("PROJECT_HASH_MISMATCH");
  });

  it("rejects unsafe archive paths before extraction", async () => {
    const files = unzipSync(await createCompletedProject(projectInput()));
    files["../original.png"] = files["source/original.png"] ?? new Uint8Array();
    delete files["source/original.png"];
    const unsafe = zipSync(files, { level: 0, mtime: new Date("1980-01-01T00:00:00Z") });
    await expect(validateCompletedProject(unsafe)).rejects.toThrow("PROJECT_UNSAFE_PATH");
  });
});
