import type {
  AttributeHeight,
  AttributeOptimizerId,
  ConversionSettings,
  PaletteSelection,
  PlatformId,
  TargetModeId,
} from "@retro-converter/conversion-core";

type Pmd85ModeRetarget = Partial<ConversionSettings["pmd85"]>;

/**
 * The settings a hardware mode is allowed to replace. Geometry, source image
 * adjustments, and the active dithering recipe deliberately are not part of
 * this type, so changing hardware cannot silently reapply a preset.
 */
export interface HardwareModeRetarget {
  readonly profileId?: string;
  readonly platformId?: PlatformId;
  readonly modeId: TargetModeId;
  readonly background?: ConversionSettings["background"];
  readonly attributeOptimizerId?: AttributeOptimizerId;
  readonly attributeHeight?: AttributeHeight;
  readonly screenFlickerSuppression?: boolean;
  readonly paletteSelections?: readonly PaletteSelection[];
  readonly pmd85?: Pmd85ModeRetarget;
}

export function retargetHardwareModeSettings(
  current: ConversionSettings,
  target: HardwareModeRetarget,
): ConversionSettings {
  return {
    ...current,
    ...target,
    paletteSelections: (target.paletteSelections ?? current.paletteSelections)
      .map((selection) => ({
        ...selection,
        enabledColorIds: [...selection.enabledColorIds],
      })),
    pmd85: {
      ...current.pmd85,
      ...target.pmd85,
    },
  };
}
