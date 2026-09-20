import {
  PMD85_SCREEN_HEIGHT,
  PMD85_SCREEN_WIDTH,
} from "@retro-converter/pmd-85";
import type { PlatformId, TargetModeId } from "./types.js";
import type { OutputPixelAspect } from "./geometry.js";

export interface DestinationGeometry {
  readonly width: number;
  readonly height: number;
  /** Logical output-pixel aspect units used by the geometry sampler. */
  readonly pixelAspect: OutputPixelAspect;
}

const ZX_DESTINATION: DestinationGeometry = {
  width: 256,
  height: 192,
  pixelAspect: { width: 1, height: 1 },
};

const QL_MODE8_DESTINATION: DestinationGeometry = {
  width: 256,
  height: 256,
  pixelAspect: { width: 4, height: 3 },
};

const QL_MODE4_DESTINATION: DestinationGeometry = {
  width: 512,
  height: 256,
  pixelAspect: { width: 2, height: 3 },
};

const PMD85_DESTINATION: DestinationGeometry = {
  width: PMD85_SCREEN_WIDTH,
  height: PMD85_SCREEN_HEIGHT,
  pixelAspect: { width: 1, height: 1 },
};

export function destinationGeometryFor(
  platformId: PlatformId,
  modeId: TargetModeId,
): DestinationGeometry {
  if (platformId === "zx-spectrum") return ZX_DESTINATION;
  if (platformId === "pmd-85") return PMD85_DESTINATION;
  if (
    modeId === "mode4-512x256" ||
    modeId === "mode4-plain-512x256" ||
    modeId === "mode4-vertical-spatial-512x256" ||
    modeId === "mode8-mode4-mixed-512x256"
  ) return QL_MODE4_DESTINATION;
  return QL_MODE8_DESTINATION;
}
