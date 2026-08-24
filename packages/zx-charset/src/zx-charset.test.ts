import { describe, expect, it } from "vitest";
import {
  createBlankScreen,
  serializeScr,
  type ZxScreen,
} from "@retro-converter/zx-spectrum";
import {
  canonicalTile,
  convertScrToCharset,
  decodeCharsetArtifact,
  invertTile,
  packTransforms,
  renderCharsetPreview,
  swapInkPaper,
  transformTile,
  unpackTransforms,
  type CharsetConversionOptions,
  type TileTransform,
} from "./index.js";

function options(
  overrides: Partial<CharsetConversionOptions> = {},
): CharsetConversionOptions {
  return {
    source: "derived",
    characterBudget: 32,
    encoding: "compact",
    allowTransforms: true,
    allowPolarity: true,
    derivedStrategy: "best-coverage",
    distanceMetric: "hybrid",
    visualWeighting: false,
    swapRefinementPasses: 1,
    ...overrides,
  };
}

function asymmetricTile(): Uint8Array {
  return Uint8Array.from([
    0b10000000,
    0b11000000,
    0b00100000,
    0b00010000,
    0b00001000,
    0b00000100,
    0b00000010,
    0b00000001,
  ]);
}

function patternedScreen(): ZxScreen {
  const screen = createBlankScreen(0b01000111);
  const patterns = [
    new Uint8Array(8),
    new Uint8Array(8).fill(0xff),
    Uint8Array.from([0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55]),
    asymmetricTile(),
  ];
  for (let cell = 0; cell < 768; cell += 1) {
    const tile = patterns[cell % patterns.length]!;
    const cellX = cell % 32;
    const cellY = Math.floor(cell / 32);
    for (let localY = 0; localY < 8; localY += 1) {
      const row = tile[localY] ?? 0;
      const offset = (cellY * 8 + localY) * 256 + cellX * 8;
      for (let localX = 0; localX < 8; localX += 1) {
        screen.pixels[offset + localX] = (row >> (7 - localX)) & 1;
      }
    }
  }
  return screen;
}

describe("ZX charset tile transforms", () => {
  it("implements eight deterministic square symmetries", () => {
    const tile = asymmetricTile();
    const keys = new Set<string>();
    for (let code = 0; code < 8; code += 1) {
      keys.add([...transformTile(tile, code as TileTransform)].join(","));
    }
    expect(keys.size).toBe(8);
    expect(transformTile(transformTile(tile, 1), 3)).toEqual(tile);
    expect(transformTile(transformTile(tile, 4), 4)).toEqual(tile);
    expect(transformTile(transformTile(tile, 6), 6)).toEqual(tile);
  });

  it("canonicalizes polarity-equivalent tiles identically", () => {
    const tile = asymmetricTile();
    expect(canonicalTile(tile, true, true)).toEqual(
      canonicalTile(invertTile(tile), true, true),
    );
  });

  it("swaps only INK and PAPER bits", () => {
    expect(swapInkPaper(0b11010110)).toBe(0b11110010);
  });
});

describe("ZX charset raw encoding", () => {
  it("packs and unpacks all 768 three-bit transforms", () => {
    const transforms = Uint8Array.from({ length: 768 }, (_, index) => index % 8);
    const packed = packTransforms(transforms);
    expect(packed).toHaveLength(288);
    expect(unpackTransforms(packed)).toEqual(transforms);
  });

  it("produces a decoder-verified lossless compact artifact", () => {
    const source = patternedScreen();
    const converted = convertScrToCharset(serializeScr(source), options());
    expect(converted.previewRgba).toEqual(renderCharsetPreview(source));
    expect(converted.previewRgba).toHaveLength(256 * 192 * 4);
    expect(converted.diagnostics.exactMatches).toBe(768);
    expect(converted.artifact.characterCount).toBeLessThanOrEqual(4);
    expect(converted.artifact.bytes.length).toBe(
      768 + 768 + converted.artifact.characterCount * 8,
    );
  });

  it("round-trips the extended transform plane", () => {
    const source = patternedScreen();
    const converted = convertScrToCharset(
      serializeScr(source),
      options({ encoding: "extended", characterBudget: 64 }),
    );
    const decoded = decodeCharsetArtifact(converted.artifact.bytes, {
      encoding: "extended",
      characterCount: converted.artifact.characterCount,
      transformations: true,
    });
    expect(renderCharsetPreview(decoded.screen)).toEqual(renderCharsetPreview(source));
    expect(converted.artifact.transforms).toHaveLength(288);
  });

  it("selects, clamps, and reindexes a loaded charset range", () => {
    const charset = Uint8Array.from(
      { length: 8 * 6 },
      (_, index) => (index * 37 + 11) & 0xff,
    );
    const converted = convertScrToCharset(
      serializeScr(patternedScreen()),
      options({
        source: "existing",
        existingCharset: charset,
        existingCharsetRange: { startIndex: 2, length: 99 },
        characterBudget: 4,
        encoding: "compact",
        allowTransforms: false,
      }),
    );
    expect(converted.artifact.characterCount).toBe(4);
    expect(converted.artifact.charset).toEqual(charset.slice(16));
    expect(converted.assignments.every((assignment) =>
      assignment.characterIndex >= 0 &&
      assignment.characterIndex < 4
    )).toBe(true);
  });

  it("packs an arbitrary loaded selection in source-index order", () => {
    const charset = Uint8Array.from(
      { length: 8 * 6 },
      (_, index) => (index * 19 + 3) & 0xff,
    );
    const converted = convertScrToCharset(
      serializeScr(patternedScreen()),
      options({
        source: "existing",
        existingCharset: charset,
        existingCharsetRange: { startIndex: 1, length: 4 },
        existingCharsetSelection: { indices: [0, 2, 5] },
        characterBudget: 3,
        encoding: "compact",
        allowTransforms: false,
      }),
    );
    const expected = new Uint8Array(24);
    expected.set(charset.subarray(0, 8), 0);
    expected.set(charset.subarray(16, 24), 8);
    expected.set(charset.subarray(40, 48), 16);
    expect(converted.artifact.charset).toEqual(expected);
    expect(converted.artifact.characterCount).toBe(3);
    expect(converted.assignments.every((assignment) =>
      assignment.characterIndex >= 0 &&
      assignment.characterIndex < 3
    )).toBe(true);
  });

  it("maps a selection containing source tile 1 to emitted tile 0", () => {
    const first = asymmetricTile();
    const second = Uint8Array.from([
      0x18, 0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x00,
    ]);
    const charset = new Uint8Array(16);
    charset.set(first, 0);
    charset.set(second, 8);
    const converted = convertScrToCharset(
      serializeScr(patternedScreen()),
      options({
        source: "existing",
        existingCharset: charset,
        existingCharsetRange: { startIndex: 0, length: 2 },
        existingCharsetSelection: { indices: [0] },
        characterBudget: 1,
        encoding: "compact",
        allowTransforms: false,
      }),
    );
    expect(converted.artifact.characterCount).toBe(1);
    expect(converted.artifact.charset).toEqual(first);
    expect(converted.assignments.every((assignment) =>
      assignment.characterIndex === 0
    )).toBe(true);
  });

  it("rejects empty, duplicate, unsorted, and unavailable selections", () => {
    const charset = new Uint8Array(4 * 8);
    const convert = (indices: readonly number[]) => convertScrToCharset(
      serializeScr(patternedScreen()),
      options({
        source: "existing",
        existingCharset: charset,
        existingCharsetRange: { startIndex: 0, length: 4 },
        existingCharsetSelection: { indices },
        characterBudget: Math.max(1, indices.length),
        encoding: "compact",
      }),
    );
    expect(() => convert([])).toThrow(/sorted, unique/);
    expect(() => convert([1, 1])).toThrow(/sorted, unique/);
    expect(() => convert([2, 1])).toThrow(/sorted, unique/);
    expect(() => convert([0, 4])).toThrow(/unavailable/);
  });

  it("encodes 256 loaded characters with transforms in Extended mapping", () => {
    const charset = Uint8Array.from(
      { length: 256 * 8 },
      (_, index) => (index * 73 + Math.floor(index / 8)) & 0xff,
    );
    const converted = convertScrToCharset(
      serializeScr(patternedScreen()),
      options({
        source: "existing",
        existingCharset: charset,
        existingCharsetRange: { startIndex: 0, length: 256 },
        characterBudget: 256,
        encoding: "extended",
        allowTransforms: true,
      }),
    );
    expect(converted.artifact.characterCount).toBe(256);
    expect(converted.artifact.transforms).toHaveLength(288);
    expect(converted.artifact.bytes).toHaveLength(768 + 768 + 288 + 2048);
    const decoded = decodeCharsetArtifact(converted.artifact.bytes, {
      encoding: "extended",
      characterCount: 256,
      transformations: true,
    });
    expect(decoded.scr).toEqual(converted.decodedScr);
  }, 10_000);

  it("uses attribute swapping instead of a persisted polarity bit", () => {
    const screen = createBlankScreen(0b01000110);
    screen.pixels.fill(1);
    const charset = new Uint8Array(8);
    const converted = convertScrToCharset(
      serializeScr(screen),
      options({
        source: "existing",
        existingCharset: charset,
        characterBudget: 1,
        allowTransforms: false,
        encoding: "compact",
        derivedStrategy: "frequency",
        distanceMetric: "hamming",
      }),
    );
    expect(converted.diagnostics.polaritySwaps).toBe(768);
    expect(converted.diagnostics.usedCharacterCount).toBe(1);
    expect(converted.diagnostics.rgbRmse).toBe(0);
    expect(converted.diagnostics.rgbSimilarityPercent).toBe(100);
    expect(converted.artifact.attributes[0]).toBe(swapInkPaper(0b01000110));
    expect(converted.decodedScreen.pixels).toEqual(new Uint8Array(256 * 192));
    expect(converted.previewRgba).toEqual(
      convertScrToCharset(
        serializeScr(screen),
        options({
          source: "derived",
          characterBudget: 1,
          allowTransforms: false,
          encoding: "compact",
          derivedStrategy: "frequency",
          distanceMetric: "hamming",
        }),
      ).previewRgba,
    );
  });

  it("rejects compact mappings above 32 characters", () => {
    expect(() => convertScrToCharset(
      serializeScr(patternedScreen()),
      options({ characterBudget: 33 }),
    )).toThrow(/at most 32|1 through 32/);
  });

  it("keeps image similarity v2 deterministic and decoder-legal", () => {
    const source = serializeScr(patternedScreen());
    const settings = options({
      derivedStrategy: "image-similarity-v2",
      distanceMetric: "image-similarity-v2",
      characterBudget: 3,
      swapRefinementPasses: 4,
    });
    const first = convertScrToCharset(source, settings);
    const second = convertScrToCharset(source, settings);
    expect(first.artifact.bytes).toEqual(second.artifact.bytes);
    expect(first.assignments).toEqual(second.assignments);
    expect(first.assignments).toHaveLength(768);
    for (const assignment of first.assignments) {
      expect(assignment.characterIndex).toBeLessThan(first.artifact.characterCount);
      expect(assignment.transform).toBeGreaterThanOrEqual(0);
      expect(assignment.transform).toBeLessThanOrEqual(7);
      expect(Number.isFinite(assignment.distance)).toBe(true);
    }
    const decoded = decodeCharsetArtifact(first.artifact.bytes, {
      encoding: first.artifact.encoding,
      characterCount: first.artifact.characterCount,
      transformations: first.artifact.transformations,
    });
    expect(decoded.scr).toEqual(first.decodedScr);
  });

  it("keeps contextual image similarity v3 deterministic and improving", () => {
    const source = serializeScr(patternedScreen());
    const settings = options({
      derivedStrategy: "image-similarity-v3",
      distanceMetric: "image-similarity-v3",
      characterBudget: 3,
      swapRefinementPasses: 4,
      visualWeighting: true,
    });
    const first = convertScrToCharset(source, settings);
    const second = convertScrToCharset(source, settings);
    expect(first.artifact.bytes).toEqual(second.artifact.bytes);
    expect(first.assignments).toEqual(second.assignments);
    expect(first.diagnostics.globalObjective).toBeTypeOf("number");
    expect(first.diagnostics.refinementPasses).toBeGreaterThanOrEqual(0);
    expect(first.diagnostics.refinementPasses).toBeLessThanOrEqual(4);
    expect(first.assignments.every((assignment) =>
      assignment.characterIndex < first.artifact.characterCount &&
      assignment.transform >= 0 &&
      assignment.transform <= 7
    )).toBe(true);
  });

  it("keeps RGB-safe image similarity v4 deterministic and non-increasing", () => {
    const source = serializeScr(patternedScreen());
    const settings = options({
      derivedStrategy: "image-similarity-v4",
      distanceMetric: "image-similarity-v4",
      characterBudget: 3,
      swapRefinementPasses: 4,
      visualWeighting: true,
    });
    const first = convertScrToCharset(source, settings);
    const second = convertScrToCharset(source, settings);
    expect(first.artifact.bytes).toEqual(second.artifact.bytes);
    expect(first.assignments).toEqual(second.assignments);
    expect(first.diagnostics.finalRgbSquaredError)
      .toBeLessThanOrEqual(first.diagnostics.initialRgbSquaredError!);
    expect(first.diagnostics.finalRgbSquaredError)
      .toBe(first.diagnostics.rgbSquaredError);
    expect(first.diagnostics.refinementPasses).toBeGreaterThanOrEqual(0);
    expect(first.diagnostics.refinementPasses).toBeLessThanOrEqual(4);
    expect(first.diagnostics.medoidSwaps).toBeGreaterThanOrEqual(0);
    expect(first.diagnostics.candidatesEvaluated).toBeGreaterThan(0);
    expect(first.diagnostics.cellsRecomputed).toBeGreaterThan(0);
    expect(first.diagnostics.candidateCacheHits).toBeGreaterThan(0);
    expect(first.diagnostics.candidateSetsPrepared).toBeGreaterThan(0);
    expect(first.assignments.every((assignment) =>
      assignment.characterIndex < first.artifact.characterCount &&
      assignment.transform >= 0 &&
      assignment.transform <= 7
    )).toBe(true);
  }, 20_000);

  it("keeps bounded image similarity v5 deterministic and RGB guarded", () => {
    const source = serializeScr(patternedScreen());
    const settings = options({
      derivedStrategy: "image-similarity-v5",
      distanceMetric: "image-similarity-v5",
      characterBudget: 3,
      swapRefinementPasses: 1,
      visualWeighting: true,
    });
    const first = convertScrToCharset(source, settings);
    const second = convertScrToCharset(source, settings);
    expect(first.artifact.bytes).toEqual(second.artifact.bytes);
    expect(first.assignments).toEqual(second.assignments);
    expect(first.diagnostics.finalRgbSquaredError)
      .toBeLessThanOrEqual(first.diagnostics.initialRgbSquaredError!);
    expect(first.diagnostics.refinementPasses).toBeGreaterThanOrEqual(0);
    expect(first.diagnostics.refinementPasses).toBeLessThanOrEqual(1);
    const improvement = first.diagnostics.initialRgbSquaredError! -
      first.diagnostics.finalRgbSquaredError!;
    expect(improvement === 0 || improvement >=
      first.diagnostics.initialRgbSquaredError! * 0.001).toBe(true);
  }, 10_000);
});
