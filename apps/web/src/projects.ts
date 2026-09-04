import { unzipSync, zipSync, type Zippable } from "fflate";
import {
  DEFAULT_CONVERSION_SETTINGS,
  assertCompatibleEngines,
  outputScreenCount,
  qlHardwareModesForTarget,
  type ConversionSettings,
  type QlTargetModeId,
} from "@retro-converter/conversion-core";
import { APPLICATION_VERSION, sha256Hex } from "./artifacts.js";
import { assertValidQlScreen } from "@retro-converter/sinclair-ql";
import { assertValidSoftwareScr } from "@retro-converter/zx-spectrum";
import { assertValidPmd85Screen } from "@retro-converter/pmd-85";
import type {
  CharsetAssignment,
  CharsetConversionOptions,
  CharsetDiagnostics,
} from "@retro-converter/zx-charset";

const PROJECT_SCHEMA_VERSION = "13.0.0";
const LEGACY_PROJECT_SCHEMA_VERSIONS = new Set(["10.0.0", "11.0.0", "12.0.0"]);
const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const FIXED_ZIP_TIME = new Date("1980-01-01T00:00:00.000Z");
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

interface CentralEntry {
  readonly path: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
}

interface ManifestEntry {
  readonly path: string;
  readonly media_type: string;
  readonly role: string;
  readonly size: number;
  readonly sha256: string;
}

export type WorkspaceConversionMode = "palette" | "tilemap";
export type TilemapConversionSettings = CharsetConversionOptions;

export interface ProjectCreateInput {
  readonly sourceBytes: Uint8Array;
  readonly sourceFormat: "png" | "jpeg" | "pmd85-bin";
  readonly resultOrigin?: "direct-import" | "converted";
  readonly settings: ConversionSettings;
  readonly scr: Uint8Array;
  readonly frames?: readonly Uint8Array[];
  readonly previewPng: Uint8Array;
  readonly metadataJson: Uint8Array;
  readonly profile: unknown;
  readonly workingSourcePng?: Uint8Array;
  readonly workspaceMode?: WorkspaceConversionMode;
  readonly tilemap?: {
    readonly settings: TilemapConversionSettings;
    readonly artifact: Uint8Array;
    readonly previewPng: Uint8Array;
    readonly diagnostics: CharsetDiagnostics;
    readonly assignments: readonly CharsetAssignment[];
    readonly charset: Uint8Array;
    readonly sourceCharset: Uint8Array;
  };
}

export interface ValidatedProject {
  readonly manifest: Record<string, unknown>;
  readonly sourcePath: string;
  readonly sourceBytes: Uint8Array;
  readonly settings: ConversionSettings;
  readonly scr: Uint8Array;
  readonly frames: readonly Uint8Array[];
  readonly previewPng: Uint8Array;
  readonly metadataJson: Uint8Array;
  readonly profile: unknown;
  readonly workspaceMode: WorkspaceConversionMode;
  readonly sourceFormat: "png" | "jpeg" | "pmd85-bin";
  readonly resultOrigin: "direct-import" | "converted";
  readonly workingSourcePng?: Uint8Array;
  readonly tilemap?: {
    readonly settings: TilemapConversionSettings;
    readonly artifact: Uint8Array;
    readonly previewPng: Uint8Array;
    readonly diagnostics: CharsetDiagnostics;
    readonly assignments: readonly CharsetAssignment[];
    readonly charset: Uint8Array;
    readonly sourceCharset: Uint8Array;
  };
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

function scanCentralDirectory(bytes: Uint8Array): CentralEntry[] {
  if (bytes.length > MAX_PROJECT_BYTES) throw new Error("PROJECT_LIMIT_EXCEEDED: container exceeds 64 MiB.");
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (readU32(bytes, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("PROJECT_INVALID_ZIP: end record is missing.");
  const entryCount = readU16(bytes, eocd + 10);
  const centralOffset = readU32(bytes, eocd + 16);
  if (entryCount < 9 || entryCount > 18 || centralOffset >= eocd) {
    throw new Error("PROJECT_ENTRY_SET_INVALID: project entry count is invalid.");
  }

  const entries: CentralEntry[] = [];
  const seen = new Set<string>();
  let totalSize = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) throw new Error("PROJECT_INVALID_ZIP: central entry is malformed.");
    const flags = readU16(bytes, offset + 8);
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const externalAttributes = readU32(bytes, offset + 38);
    if ((flags & 1) !== 0) throw new Error("PROJECT_ENCRYPTED_ENTRY: encrypted files are forbidden.");
    if (method !== 0 && method !== 8) throw new Error("PROJECT_COMPRESSION_UNSUPPORTED: ZIP method is unsupported.");
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) throw new Error("PROJECT_LINK_ENTRY: links are forbidden.");
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) throw new Error("PROJECT_INVALID_ZIP: filename is truncated.");
    const path = textDecoder.decode(bytes.subarray(nameStart, nameEnd)).normalize("NFC");
    if (
      path === "" || path.startsWith("/") || path.includes("\\") ||
      path.split("/").some((part) => part === "" || part === "." || part === "..")
    ) throw new Error("PROJECT_UNSAFE_PATH: archive path is unsafe.");
    if (seen.has(path)) throw new Error("PROJECT_DUPLICATE_PATH: normalized path is duplicated.");
    seen.add(path);
    totalSize += uncompressedSize;
    if (totalSize > MAX_UNCOMPRESSED_BYTES) throw new Error("PROJECT_LIMIT_EXCEEDED: expanded data exceeds 128 MiB.");
    entries.push({ path, compressedSize, uncompressedSize });
    offset = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  if (bytes.length > 4 * 1024 * 1024) throw new Error(`PROJECT_LIMIT_EXCEEDED: ${label} exceeds 4 MiB.`);
  try {
    return JSON.parse(textDecoder.decode(bytes));
  } catch {
    throw new Error(`PROJECT_JSON_INVALID: ${label} is invalid UTF-8 JSON.`);
  }
}

function assertTilemapSettings(
  value: unknown,
): asserts value is TilemapConversionSettings {
  if (typeof value !== "object" || value === null) {
    throw new Error("PROJECT_SCHEMA_INVALID: tilemap settings are missing.");
  }
  const settings = value as Record<string, unknown>;
  const maximum = settings.encoding === "compact" ? 32 : 256;
  if (
    !["derived", "existing"].includes(String(settings.source)) ||
    !["compact", "extended"].includes(String(settings.encoding)) ||
    !Number.isInteger(settings.characterBudget) ||
    Number(settings.characterBudget) < 1 ||
    Number(settings.characterBudget) > maximum ||
    typeof settings.allowTransforms !== "boolean" ||
    typeof settings.allowPolarity !== "boolean" ||
    !["frequency", "best-coverage", "image-similarity-v2", "image-similarity-v3", "image-similarity-v4", "image-similarity-v5"].includes(
      String(settings.derivedStrategy),
    ) ||
    !["hamming", "hybrid", "image-similarity-v2", "image-similarity-v3", "image-similarity-v4", "image-similarity-v5"].includes(
      String(settings.distanceMetric),
    ) ||
    typeof settings.visualWeighting !== "boolean"
  ) {
    throw new Error("PROJECT_SCHEMA_INVALID: tilemap settings are invalid.");
  }
  const range = settings.existingCharsetRange as
    | Record<string, unknown>
    | undefined;
  if (
    range !== undefined &&
    (
      settings.source !== "existing" ||
      !Number.isInteger(range.startIndex) ||
      Number(range.startIndex) < 0 ||
      !Number.isInteger(range.length) ||
      Number(range.length) < 1
    )
  ) {
    throw new Error("PROJECT_SCHEMA_INVALID: existing charset range is invalid.");
  }
  const selection = settings.existingCharsetSelection as
    | Record<string, unknown>
    | undefined;
  const indices = selection?.indices;
  if (
    selection !== undefined &&
    (
      settings.source !== "existing" ||
      !Array.isArray(indices) ||
      indices.length < 1 ||
      indices.length !== Number(settings.characterBudget) ||
      indices.some((index, position) =>
        !Number.isInteger(index) ||
        Number(index) < 0 ||
        (
          position > 0 &&
          Number(index) <= Number(indices[position - 1])
        )
      )
    )
  ) {
    throw new Error("PROJECT_SCHEMA_INVALID: existing charset selection is invalid.");
  }
}

export async function createCompletedProject(input: ProjectCreateInput): Promise<Uint8Array> {
  const sourcePath = input.sourceFormat === "pmd85-bin"
    ? "source/original.bin"
    : `source/original.${input.sourceFormat === "png" ? "png" : "jpg"}`;
  const profileBytes = jsonBytes(input.profile);
  const settingsBytes = jsonBytes({
    schema_version: PROJECT_SCHEMA_VERSION,
    quality_level: "High",
    seed: "none",
    settings: input.settings,
  });
  const content: Record<string, Uint8Array> = {
    [sourcePath]: input.sourceBytes,
    "profile/profile.json": profileBytes,
    "settings/conversion.json": settingsBytes,
    "artifacts/screen-1.bin": input.scr,
    "artifacts/preview.png": input.previewPng,
    "artifacts/metadata.json": input.metadataJson,
    "settings/workspace.json": jsonBytes({
      conversion_mode: input.workspaceMode ?? "palette",
      source_kind: input.sourceFormat === "pmd85-bin" ? "pmd85-bin" : "image",
      selected_interpretation: input.settings.platformId === "pmd-85"
        ? input.settings.modeId
        : null,
      result_origin: input.resultOrigin ?? "converted",
      tilemap_settings: input.tilemap?.settings ?? null,
      working_source_path: input.workingSourcePng === undefined ? null : "source/working.png",
      working_source_edited: input.workingSourcePng !== undefined,
    }),
  };
  if (input.workingSourcePng !== undefined) {
    content["source/working.png"] = input.workingSourcePng;
  }
  if (input.tilemap !== undefined) {
    content["artifacts/tilemap.bin"] = input.tilemap.artifact;
    content["artifacts/tilemap-preview.png"] = input.tilemap.previewPng;
    content["artifacts/tilemap-diagnostics.json"] = jsonBytes(
      input.tilemap.diagnostics,
    );
    content["artifacts/tilemap-assignments.json"] = jsonBytes(
      input.tilemap.assignments,
    );
    content["artifacts/tilemap-charset.bin"] = input.tilemap.charset;
    content["artifacts/tilemap-source-charset.bin"] =
      input.tilemap.sourceCharset;
  }
  const frames = input.frames ?? [input.scr];
  if (frames[1] !== undefined) {
    content["artifacts/screen-2.bin"] = frames[1];
  }
  const integrityHashes: Record<string, string> = {};
  for (const path of Object.keys(content).sort()) integrityHashes[path] = await sha256Hex(content[path] ?? new Uint8Array());
  const integrityBytes = jsonBytes({ algorithm: "SHA-256", entries: integrityHashes });
  content["integrity/sha256.json"] = integrityBytes;

  const media: Record<string, [string, string]> = {
    [sourcePath]: [input.sourceFormat === "png"
      ? "image/png"
      : input.sourceFormat === "jpeg"
        ? "image/jpeg"
        : "application/octet-stream", "original-source"],
    "source/working.png": ["image/png", "working-source"],
    "profile/profile.json": ["application/json", "profile-snapshot"],
    "settings/conversion.json": ["application/json", "conversion-settings"],
    "artifacts/screen-1.bin": ["application/octet-stream", "hardware-screen"],
    "artifacts/screen-2.bin": ["application/octet-stream", "secondary-hardware-screen"],
    "artifacts/preview.png": ["image/png", "preview"],
    "artifacts/metadata.json": ["application/json", "conversion-metadata"],
    "settings/workspace.json": ["application/json", "workspace-settings"],
    "artifacts/tilemap.bin": ["application/octet-stream", "tilemap-artifact"],
    "artifacts/tilemap-preview.png": ["image/png", "tilemap-decoder-preview"],
    "artifacts/tilemap-diagnostics.json": ["application/json", "tilemap-diagnostics"],
    "artifacts/tilemap-assignments.json": ["application/json", "tilemap-assignments"],
    "artifacts/tilemap-charset.bin": ["application/octet-stream", "tilemap-charset"],
    "artifacts/tilemap-source-charset.bin": ["application/octet-stream", "tilemap-source-charset"],
    "integrity/sha256.json": ["application/json", "integrity"],
  };
  const entries: ManifestEntry[] = [];
  for (const path of Object.keys(content).sort()) {
    const bytes = content[path] ?? new Uint8Array();
    const [mediaType, role] = media[path] ?? ["application/octet-stream", "unknown"];
    entries.push({ path, media_type: mediaType, role, size: bytes.length, sha256: await sha256Hex(bytes) });
  }
  const selfEntry: ManifestEntry = {
    path: "manifest.json",
    media_type: "application/json",
    role: "manifest",
    size: 0,
    sha256: "self-projection",
  };
  const manifest = {
    schema_version: PROJECT_SCHEMA_VERSION,
    application_version: APPLICATION_VERSION,
    compatibility: { minimum: APPLICATION_VERSION, maximum: APPLICATION_VERSION },
    entries: [selfEntry, ...entries],
  };
  let manifestBytes = jsonBytes(manifest);
  while (selfEntry.size !== manifestBytes.length) {
    (selfEntry as { size: number }).size = manifestBytes.length;
    manifestBytes = jsonBytes(manifest);
  }

  const zipEntries: Zippable = {
    "manifest.json": [manifestBytes, { level: 0, mtime: FIXED_ZIP_TIME }],
  };
  for (const path of Object.keys(content).sort()) {
    zipEntries[path] = [content[path] ?? new Uint8Array(), { level: 0, mtime: FIXED_ZIP_TIME }];
  }
  return Uint8Array.from(zipSync(zipEntries, { level: 0, mtime: FIXED_ZIP_TIME }));
}

export async function validateCompletedProject(bytes: Uint8Array): Promise<ValidatedProject> {
  const centralEntries = scanCentralDirectory(bytes);
  const files = unzipSync(bytes);
  const paths = centralEntries.map((entry) => entry.path).sort();
  const manifestBytes = files["manifest.json"];
  if (manifestBytes === undefined) throw new Error("PROJECT_ENTRY_MISSING: manifest.json is required.");
  const manifestValue = parseJson(manifestBytes, "manifest.json");
  if (typeof manifestValue !== "object" || manifestValue === null) throw new Error("PROJECT_SCHEMA_INVALID: manifest must be an object.");
  const manifest = manifestValue as Record<string, unknown>;
  const schemaVersion = manifest.schema_version;
  const legacy = LEGACY_PROJECT_SCHEMA_VERSIONS.has(String(schemaVersion));
  if (schemaVersion !== PROJECT_SCHEMA_VERSION && !legacy) {
    throw new Error("PROJECT_VERSION_INCOMPATIBLE: schema is unsupported.");
  }
  const compatibility = manifest.compatibility as Record<string, unknown> | undefined;
  if (!legacy && (compatibility?.minimum !== APPLICATION_VERSION || compatibility.maximum !== APPLICATION_VERSION)) {
    throw new Error("PROJECT_VERSION_INCOMPATIBLE: application version is unsupported.");
  }
  const declared = manifest.entries;
  if (!Array.isArray(declared) || declared.length < 9 || declared.length > 19) {
    throw new Error("PROJECT_SCHEMA_INVALID: manifest entry count is invalid.");
  }
  const declaredPaths = declared.map((entry) => (entry as ManifestEntry).path).sort();
  if (JSON.stringify(declaredPaths) !== JSON.stringify(paths)) throw new Error("PROJECT_UNDECLARED_ENTRY: manifest and archive entries differ.");
  for (const rawEntry of declared) {
    const entry = rawEntry as ManifestEntry;
    const file = files[entry.path];
    if (file === undefined || file.length !== entry.size) throw new Error(`PROJECT_SIZE_MISMATCH: ${entry.path}.`);
    if (entry.path !== "manifest.json" && await sha256Hex(file) !== entry.sha256) {
      throw new Error(`PROJECT_HASH_MISMATCH: ${entry.path}.`);
    }
  }
  const sourcePath = paths.find((path) =>
    path === "source/original.png" ||
    path === "source/original.jpg" ||
    path === "source/original.bin"
  );
  if (sourcePath === undefined) throw new Error("PROJECT_ENTRY_MISSING: original source is required.");
  const workspaceDocument = parseJson(
    files["settings/workspace.json"] ?? new Uint8Array(),
    "settings/workspace.json",
  ) as Record<string, unknown>;
  const workingSourcePath = workspaceDocument.working_source_path === undefined
    ? null
    : workspaceDocument.working_source_path;
  const workingSourceEdited = workspaceDocument.working_source_edited;
  if (workingSourceEdited !== undefined && typeof workingSourceEdited !== "boolean") {
    throw new Error("PROJECT_SCHEMA_INVALID: working source state is invalid.");
  }
  const workingSourcePng = workingSourcePath === "source/working.png"
    ? Uint8Array.from(files["source/working.png"] ?? new Uint8Array())
    : undefined;
  if (workingSourcePath !== null && workingSourcePath !== "source/working.png") {
    throw new Error("PROJECT_SCHEMA_INVALID: working source path is invalid.");
  }
  if (workingSourcePath === "source/working.png" &&
      (workingSourcePng === undefined || workingSourcePng.length === 0)) {
    throw new Error("PROJECT_ENTRY_MISSING: working source is required.");
  }
  if (workingSourcePath === null && workingSourceEdited === true) {
    throw new Error("PROJECT_SCHEMA_INVALID: edited working source is missing.");
  }
  const usesLegacyArtifactNames = schemaVersion === "10.0.0";
  const firstArtifactPath = usesLegacyArtifactNames ? "artifacts/result.scr" : "artifacts/screen-1.bin";
  const secondArtifactPath = usesLegacyArtifactNames ? "artifacts/result-screen-2.scr" : "artifacts/screen-2.bin";
  const required = [
    "profile/profile.json", "settings/conversion.json", firstArtifactPath,
    "artifacts/preview.png", "artifacts/metadata.json", "integrity/sha256.json",
    "settings/workspace.json",
  ];
  for (const path of required) if (files[path] === undefined) throw new Error(`PROJECT_ENTRY_MISSING: ${path}.`);
  const settingsDocument = parseJson(files["settings/conversion.json"] ?? new Uint8Array(), "settings/conversion.json") as Record<string, unknown>;
  const profile = parseJson(files["profile/profile.json"] ?? new Uint8Array(), "profile/profile.json");
  if (
    settingsDocument.schema_version !== schemaVersion ||
    settingsDocument.quality_level !== "High"
  ) {
    throw new Error("PROJECT_SCHEMA_INVALID: conversion settings are incompatible.");
  }
  const rawSettings = settingsDocument.settings as Partial<ConversionSettings> | undefined;
  const metadataDocument = parseJson(
    files["artifacts/metadata.json"] ?? new Uint8Array(),
    "artifacts/metadata.json",
  ) as Record<string, unknown>;
  const metadataZx = metadataDocument.zx_spectrum as Record<string, unknown> | undefined;
  const archivedBorder = Number.isInteger(metadataZx?.border_color)
    ? metadataZx?.border_color as number
    : DEFAULT_CONVERSION_SETTINGS.borderColor;
  const settings: ConversionSettings = {
    ...DEFAULT_CONVERSION_SETTINGS,
    ...rawSettings,
    structured: {
      ...DEFAULT_CONVERSION_SETTINGS.structured,
      ...rawSettings?.structured,
    },
    pmd85: {
      ...DEFAULT_CONVERSION_SETTINGS.pmd85,
      ...rawSettings?.pmd85,
    },
    borderColor: rawSettings?.borderColor ?? archivedBorder,
  };
  if (
    !Array.isArray(settings.paletteSelections) ||
    settings.paletteSelections.length !== outputScreenCount(settings.modeId) ||
    settings.paletteSelections.some((selection, screenIndex) =>
      selection.screenIndex !== screenIndex ||
      selection.enabledColorIds.length === 0 ||
      new Set(selection.enabledColorIds).size !== selection.enabledColorIds.length ||
      selection.enabledColorIds.some((color: number) =>
        !Number.isInteger(color) || color < 0 || color > 7
      ) ||
      (
        settings.platformId === "zx-spectrum"
          ? !["auto", "on", "off"].includes(String(selection.brightMode))
          : selection.brightMode !== undefined
      )
    )
  ) {
    throw new Error("PROJECT_SCHEMA_INVALID: screen palette selections are invalid.");
  }
  assertCompatibleEngines(
    settings.platformId,
    settings.attributeOptimizerId,
    settings.ditherEngineId,
  );
  if (settings.modeId.includes("vertical-spatial")) {
    const spatialDitherEngine = settings.dithering === "none"
      ? "vertical-spatial-none-v1"
      : settings.dithering === "ordered"
        ? "vertical-spatial-ordered-v1"
        : "vertical-spatial-error-diffusion-v1";
    if (
      settings.verticalSpatialMix?.schemaVersion !== 1 ||
      settings.verticalSpatialMix.algorithmId !== (
        settings.attributeOptimizerId === "zx-vertical-spatial-detail-v1"
          ? "vertical-spatial-detail-v1"
          : "vertical-spatial-uniform-v1"
      ) ||
      settings.verticalSpatialMix.calibrationId !== "srgb-ideal-v1" ||
      settings.ditherEngineId !== spatialDitherEngine ||
      (
        settings.platformId === "zx-spectrum"
          ? ![
              "zx-vertical-spatial-uniform-v1",
              "zx-vertical-spatial-detail-v1",
            ].includes(settings.attributeOptimizerId)
          : settings.platformId === "sinclair-ql"
            ? settings.attributeOptimizerId !== "ql-vertical-spatial-uniform-v1"
            : settings.attributeOptimizerId !== "pmd85-vertical-spatial-uniform-v1"
      )
    ) throw new Error("PROJECT_SCHEMA_INVALID: vertical spatial settings are invalid.");
  } else if (
    settings.verticalSpatialMix !== undefined ||
    settings.ditherEngineId.startsWith("vertical-spatial-")
  ) {
    throw new Error("PROJECT_SCHEMA_INVALID: spatial settings require a spatial target.");
  }
  const integrity = parseJson(files["integrity/sha256.json"] ?? new Uint8Array(), "integrity/sha256.json") as Record<string, unknown>;
  const integrityEntries = integrity.entries as Record<string, unknown> | undefined;
  for (const path of Object.keys(files).filter((path) => path !== "manifest.json" && path !== "integrity/sha256.json")) {
    if (integrityEntries?.[path] !== await sha256Hex(files[path] ?? new Uint8Array())) {
      throw new Error(`PROJECT_INTEGRITY_MISMATCH: ${path}.`);
    }
  }
  const workspaceMode = workspaceDocument.conversion_mode;
  if (workspaceMode !== "palette" && workspaceMode !== "tilemap") {
    throw new Error("PROJECT_SCHEMA_INVALID: conversion mode is invalid.");
  }
  const sourceFormat = sourcePath.endsWith(".bin")
    ? "pmd85-bin"
    : sourcePath.endsWith(".png") ? "png" : "jpeg";
  const resultOrigin = usesLegacyArtifactNames
    ? "converted"
    : workspaceDocument.result_origin;
  if (resultOrigin !== "direct-import" && resultOrigin !== "converted") {
    throw new Error("PROJECT_SCHEMA_INVALID: result origin is invalid.");
  }
  if (sourceFormat === "pmd85-bin" && settings.platformId !== "pmd-85") {
    throw new Error("PROJECT_SCHEMA_INVALID: PMD binary source requires the pmd-85 platform.");
  }
  const tilemapPaths = [
    "artifacts/tilemap.bin",
    "artifacts/tilemap-preview.png",
    "artifacts/tilemap-diagnostics.json",
    "artifacts/tilemap-assignments.json",
    "artifacts/tilemap-charset.bin",
    "artifacts/tilemap-source-charset.bin",
  ] as const;
  if (
    workspaceMode === "tilemap" &&
    tilemapPaths.some((path) => files[path] === undefined)
  ) {
    throw new Error("PROJECT_ENTRY_MISSING: tilemap project artifacts are incomplete.");
  }
  const tilemapSettings = workspaceDocument.tilemap_settings as
    | TilemapConversionSettings
    | null;
  if (workspaceMode === "tilemap") {
    assertTilemapSettings(tilemapSettings);
  }
  const tilemapAssignments = workspaceMode === "tilemap"
    ? parseJson(
        files["artifacts/tilemap-assignments.json"] ?? new Uint8Array(),
        "artifacts/tilemap-assignments.json",
      )
    : null;
  if (
    workspaceMode === "tilemap" &&
    (!Array.isArray(tilemapAssignments) || tilemapAssignments.length !== 768)
  ) {
    throw new Error("PROJECT_SCHEMA_INVALID: tilemap assignments are invalid.");
  }
  const tilemapCharset = Uint8Array.from(
    files["artifacts/tilemap-charset.bin"] ?? new Uint8Array(),
  );
  const tilemapSourceCharset = Uint8Array.from(
    files["artifacts/tilemap-source-charset.bin"] ?? new Uint8Array(),
  );
  if (
    workspaceMode === "tilemap" &&
    (
      tilemapCharset.length === 0 ||
      tilemapCharset.length % 8 !== 0 ||
      tilemapCharset.length > 256 * 8
    )
  ) {
    throw new Error("PROJECT_SCHEMA_INVALID: tilemap charset is invalid.");
  }
  if (
    workspaceMode === "tilemap" &&
    (
      tilemapSourceCharset.length === 0 ||
      tilemapSourceCharset.length % 8 !== 0 ||
      tilemapSourceCharset.length > 256 * 8
    )
  ) {
    throw new Error("PROJECT_SCHEMA_INVALID: tilemap source charset is invalid.");
  }
  if (
    workspaceMode === "tilemap" &&
    tilemapSettings?.source === "existing"
  ) {
    const range = tilemapSettings.existingCharsetRange;
    const availableCount = tilemapSourceCharset.length / 8;
    if (
      range === undefined ||
      range.startIndex >= availableCount ||
      range.startIndex + range.length > availableCount
    ) {
      throw new Error("PROJECT_SCHEMA_INVALID: existing charset range exceeds the source charset.");
    }
    const selection = tilemapSettings.existingCharsetSelection;
    if (
      selection !== undefined &&
      selection.indices.some((index) => index >= availableCount)
    ) {
      throw new Error(
        "PROJECT_SCHEMA_INVALID: existing charset selection exceeds the source charset.",
      );
    }
  }
  const tilemap = workspaceMode === "tilemap" && tilemapSettings !== null
    ? {
        settings: tilemapSettings,
        artifact: Uint8Array.from(
          files["artifacts/tilemap.bin"] ?? new Uint8Array(),
        ),
        previewPng: Uint8Array.from(
          files["artifacts/tilemap-preview.png"] ?? new Uint8Array(),
        ),
        diagnostics: parseJson(
          files["artifacts/tilemap-diagnostics.json"] ?? new Uint8Array(),
          "artifacts/tilemap-diagnostics.json",
        ) as CharsetDiagnostics,
        assignments: tilemapAssignments as readonly CharsetAssignment[],
        charset: tilemapCharset,
        sourceCharset: tilemapSourceCharset,
      }
    : undefined;
  const frames = [
    Uint8Array.from(files[firstArtifactPath] ?? new Uint8Array()),
    ...(files[secondArtifactPath] === undefined
      ? []
      : [Uint8Array.from(files[secondArtifactPath])]),
  ];
  if (frames.length !== outputScreenCount(settings.modeId)) {
    throw new Error("PROJECT_SCHEMA_INVALID: hardware frame count is invalid.");
  }
  if (settings.platformId === "sinclair-ql") {
    const hardwareModes = qlHardwareModesForTarget(
      settings.modeId as QlTargetModeId,
    );
    frames.forEach((frame, index) =>
      assertValidQlScreen(frame, hardwareModes[index]!)
    );
  } else if (settings.platformId === "zx-spectrum") {
    frames.forEach((frame) =>
      assertValidSoftwareScr(frame, settings.attributeHeight)
    );
  } else {
    frames.forEach(assertValidPmd85Screen);
  }
  return {
    manifest,
    sourcePath,
    sourceBytes: Uint8Array.from(files[sourcePath] ?? new Uint8Array()),
    settings,
    scr: Uint8Array.from(files[firstArtifactPath] ?? new Uint8Array()),
    frames,
    previewPng: Uint8Array.from(files["artifacts/preview.png"] ?? new Uint8Array()),
    metadataJson: Uint8Array.from(files["artifacts/metadata.json"] ?? new Uint8Array()),
    profile,
    workspaceMode,
    sourceFormat,
    resultOrigin,
    ...(workingSourcePng === undefined ? {} : { workingSourcePng }),
    ...(tilemap === undefined ? {} : { tilemap }),
  };
}
