import { buildSpecsciiCharset } from "./specscii.js";
import { type WorkerCharsetResult } from "./worker/client.js";
import { CHARSET_ARTIFACT_HEADER_BYTES, encodeCharsetArtifact, decodeCharsetArtifact, renderCharsetPreview } from "@retro-converter/zx-charset";

export function glyphDataUrl(
  bytes: Uint8Array,
  characterIndex: number,
  active = true,
  zeroUse = false,
): string {
  const rows = bytes.subarray(characterIndex * 8, characterIndex * 8 + 8);
  const pixels: string[] = [];
  for (let y = 0; y < 8; y += 1) {
    const row = rows[y] ?? 0;
    for (let x = 0; x < 8; x += 1) {
      if ((row & (0x80 >> x)) !== 0) {
        pixels.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
      }
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">` +
    `<rect width="8" height="8" fill="#000"/><g fill="${zeroUse ? "#7f8998" : active ? "#fff" : "#174a7e"}">${pixels.join("")}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export interface SpecsciiFontAssets {
  readonly romFont: Uint8Array;
  readonly udgFont: Uint8Array;
  readonly charset: Uint8Array;
}

export const BUILT_IN_SPECSCII_CHARSET_NAME = "SpecSCII built-in font · 112 glyphs";
let specsciiFontAssetsRequest: Promise<SpecsciiFontAssets> | null = null;

export function loadSpecsciiFontAssets(): Promise<SpecsciiFontAssets> {
  if (specsciiFontAssetsRequest !== null) return specsciiFontAssetsRequest;
  const request = (async (): Promise<SpecsciiFontAssets> => {
    const [romResponse, udgResponse] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}specscii-rom-font.bin`),
      fetch(`${import.meta.env.BASE_URL}specscii-udg-font.bin`),
    ]);
    if (!romResponse.ok || !udgResponse.ok) {
      throw new Error("Specscii character font assets are unavailable.");
    }
    const [romFont, udgFont] = await Promise.all([
      romResponse.arrayBuffer(),
      udgResponse.arrayBuffer(),
    ]).then(([rom, udg]) => [new Uint8Array(rom), new Uint8Array(udg)] as const);
    return { romFont, udgFont, charset: buildSpecsciiCharset(romFont, udgFont) };
  })();
  specsciiFontAssetsRequest = request;
  void request.catch(() => {
    if (specsciiFontAssetsRequest === request) specsciiFontAssetsRequest = null;
  });
  return request;
}

export function rebuildCharsetResult(
  result: WorkerCharsetResult,
  charset: Uint8Array,
  assignments = result.assignments,
  encoding = result.encoding,
  attributes = result.attributes,
): WorkerCharsetResult {
  const characterIndices = Uint8Array.from(
    assignments,
    (assignment) => assignment.characterIndex,
  );
  const transforms = Uint8Array.from(
    assignments,
    (assignment) => assignment.transform,
  );
  const artifact = encodeCharsetArtifact({
    encoding,
    characterCount: charset.length / 8,
    transformations: result.transformations,
    characterIndices,
    attributes,
    transforms,
    charset,
  });
  const decoded = decodeCharsetArtifact(artifact.bytes, {
    encoding,
    characterCount: charset.length / 8,
    transformations: result.transformations,
  });
  return {
    ...result,
    encoding,
    characterCount: charset.length / 8,
    artifact: artifact.bytes,
    decodedScr: decoded.scr,
    previewRgba: renderCharsetPreview(decoded.screen),
    charset: artifact.charset,
    attributes: artifact.attributes,
    assignments,
    diagnostics: {
      ...result.diagnostics,
      edited: true,
      usedCharacterCount: new Set(characterIndices).size,
      memory: {
        headerBytes: CHARSET_ARTIFACT_HEADER_BYTES,
        tilemapBytes: artifact.tilemap.length,
        attributeBytes: artifact.attributes.length,
        transformBytes: artifact.transforms.length,
        charsetBytes: artifact.charset.length,
        totalBytes: artifact.bytes.length,
      },
    },
  };
}

export function clampCharsetRange(
  availableCount: number,
  startIndex: number,
  length: number,
): { readonly startIndex: number; readonly length: number } {
  if (availableCount < 1) return { startIndex: 0, length: 0 };
  const clampedStart = Math.max(
    0,
    Math.min(Math.trunc(startIndex), availableCount - 1),
  );
  return {
    startIndex: clampedStart,
    length: Math.max(
      1,
      Math.min(Math.trunc(length), availableCount - clampedStart),
    ),
  };
}
