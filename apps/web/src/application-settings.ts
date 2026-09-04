import type { TargetModeId } from "@retro-converter/conversion-core";
import type { WorkspaceLayoutId } from "./workspace-preferences.js";

export const APPLICATION_SETTINGS_KEY = "retro-converter.application-settings.v1";

export interface ApplicationSettings {
  readonly profileId: string;
  readonly presetId: string;
  readonly modeId: TargetModeId;
  readonly framing: "fill" | "fit" | "crop";
  readonly dithering: "none" | "ordered" | "error-diffusion";
  readonly ditheringAmount: number;
  readonly workspaceLayout: WorkspaceLayoutId;
  readonly mouseWheelZoom: boolean;
  readonly synchronizePan: boolean;
}

export interface ApplicationSettingsCatalog {
  readonly profiles: readonly {
    readonly id: string;
    readonly presets: readonly { readonly id: string }[];
  }[];
  readonly compatibleModeIds: readonly string[];
}

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettings = {
  profileId: "org.retroconverter.zx48.default",
  presetId: "default",
  modeId: "zx48-standard-256x192",
  framing: "fill",
  dithering: "none",
  ditheringAmount: 100,
  workspaceLayout: "conversion",
  mouseWheelZoom: true,
  synchronizePan: true,
};

const FRAMINGS = new Set(["fill", "fit", "crop"]);
const DITHERING = new Set(["none", "ordered", "error-diffusion"]);
const LAYOUTS = new Set([
  "conversion", "palette", "tilemap", "editor", "inspection", "custom",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateApplicationSettings(value: unknown): ApplicationSettings | null {
  if (!isRecord(value) || typeof value.profileId !== "string" ||
      typeof value.presetId !== "string" || typeof value.modeId !== "string" ||
      typeof value.framing !== "string" || !FRAMINGS.has(value.framing) ||
      typeof value.dithering !== "string" || !DITHERING.has(value.dithering) ||
      typeof value.ditheringAmount !== "number" || !Number.isFinite(value.ditheringAmount) ||
      value.ditheringAmount < 0 || value.ditheringAmount > 100 ||
      typeof value.workspaceLayout !== "string" || !LAYOUTS.has(value.workspaceLayout) ||
      typeof value.mouseWheelZoom !== "boolean" || typeof value.synchronizePan !== "boolean") {
    return null;
  }
  return {
    profileId: value.profileId,
    presetId: value.presetId,
    modeId: value.modeId as TargetModeId,
    framing: value.framing as ApplicationSettings["framing"],
    dithering: value.dithering as ApplicationSettings["dithering"],
    ditheringAmount: value.ditheringAmount,
    workspaceLayout: value.workspaceLayout as WorkspaceLayoutId,
    mouseWheelZoom: value.mouseWheelZoom,
    synchronizePan: value.synchronizePan,
  };
}

export function loadApplicationSettings(storage: Storage): ApplicationSettings {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(APPLICATION_SETTINGS_KEY) ?? "null");
    return validateApplicationSettings(parsed) ?? DEFAULT_APPLICATION_SETTINGS;
  } catch {
    return DEFAULT_APPLICATION_SETTINGS;
  }
}

export function saveApplicationSettings(storage: Storage, settings: ApplicationSettings): void {
  try {
    storage.setItem(APPLICATION_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Preferences are optional; the application remains usable without storage.
  }
}

export function resolveApplicationSettings(
  settings: ApplicationSettings,
  catalog: ApplicationSettingsCatalog,
): ApplicationSettings {
  const fallbackProfile = catalog.profiles.find(({ id }) => id === DEFAULT_APPLICATION_SETTINGS.profileId)
    ?? catalog.profiles[0];
  const profile = catalog.profiles.find(({ id }) => id === settings.profileId) ?? fallbackProfile;
  const profileId = profile?.id ?? settings.profileId;
  const preset = profile?.presets.find(({ id }) => id === settings.presetId)
    ?? profile?.presets.find(({ id }) => id === DEFAULT_APPLICATION_SETTINGS.presetId)
    ?? profile?.presets[0];
  const presetId = preset?.id ?? settings.presetId;
  const modeId = catalog.compatibleModeIds.includes(settings.modeId)
    ? settings.modeId
    : catalog.compatibleModeIds.includes(DEFAULT_APPLICATION_SETTINGS.modeId)
      ? DEFAULT_APPLICATION_SETTINGS.modeId
      : (catalog.compatibleModeIds[0] as TargetModeId | undefined) ?? settings.modeId;
  return { ...settings, profileId, presetId, modeId };
}
