import { useEffect, useLayoutEffect, useMemo } from "react";
import { profileModeScreens } from "../profiles.js";
import { type WorkerConversionResult } from "../worker/client.js";
import { buildVerticalSpatialAnalyticPreview, paletteSelectionsMatch, renderZxFlashPreview } from "@retro-converter/conversion-core";
import { mergeTemporalRgba } from "../monochrome-preview.js";
import { distinctPreviewColors } from "../palette-display.js";
import { renderQlMixedDisplayPreview } from "../ql-mixed-preview.js";
import { previewDifferenceHeatmap, rgbaPngDataUrl } from "../preview-metrics.js";
import { type PreviewContent } from "../app-types.js";
import { draftPreviewResult } from "../draft-preview-state.js";
import { zxSoftwareScrBytes } from "@retro-converter/zx-spectrum";
import { effectiveScreenFlickerSuppression } from "../artifacts.js";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useWorkbenchWindows } from "./use-workbench-windows.js";
import type { useWorkbenchLayout } from "./use-workbench-layout.js";
import type { useConversionSettings } from "./use-conversion-settings.js";
import type { usePreviewInspection } from "./use-preview-inspection.js";
import type { usePreviewSizing } from "./use-preview-sizing.js";
import { workspaceProfileSnapshotKey } from "./preview-inspection-helpers.js";
import { sharedBitmapDiagnosticsText } from "./preview-labels-helpers.js";

export function usePreviewLabels(
  { activeWorkspaceProfileId, applyWorkspaceLayout, attributeHeight, bitmapEditorActiveSide, bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase, bitmapEditorOriginalResult, bitmapEditorResultEdited, bitmapEditorRevertSource, charsetState, conversionSettings, currentWorkspaceProfileSnapshotKey, displayedResult, draftState, hiddenBuiltinWorkspaceProfileIds, image, isPmd, isQl, isZx, outputPreviewStage, paletteSelections, pmd85PaletteCalibrationId, previewAspect, previewAspectRatio, previewViewportSizes, qlMixedDisplayResolution, resolvedZxPalette, resultPreviewContent, resultPreviewZoom, resultViewportRef, resultZoom, savedWorkbenchLayouts, selectWorkspaceProfile, selectedProfile, setPreviewViewportSizes, setWorkspaceProfileBaseline, setWorkspaceProfileBaselinePending, sourcePreviewContent, sourcePreviewZoom, sourceStageAspect, sourceViewportRef, sourceZoom, specsciiDocumentName, state, targetModeId, tileEditorEdited, tilemapStale, updateBitmapEditorNavigatorViewport, workbenchPreviewLayer, workbenchResultFloating, workbenchSourceFloating, workbenchWindowLayouts, workspaceLayout, workspaceMode, workspaceProfileBaseline, workspaceProfileBaselinePending, workspaceProfileOptions, zxPaletteOptions }: Pick<ReturnType<typeof useRuntimeState>, "bitmapEditorFlashPreviewMode" | "bitmapEditorFlashPreviewPhase" | "bitmapEditorOriginalResult" | "bitmapEditorResultEdited" | "bitmapEditorRevertSource" | "charsetState" | "draftState" | "resultViewportRef" | "sourceViewportRef" | "state" | "tileEditorEdited"> &
    Pick<ReturnType<typeof useSettingsState>, "attributeHeight" | "image" | "paletteSelections" | "resolvedZxPalette" | "specsciiDocumentName" | "targetModeId" | "tilemapStale" | "workspaceMode" | "zxPaletteOptions"> &
    Pick<ReturnType<typeof useWorkbenchState>, "activeWorkspaceProfileId" | "hiddenBuiltinWorkspaceProfileIds" | "isPmd" | "isQl" | "isZx" | "outputPreviewStage" | "pmd85PaletteCalibrationId" | "previewViewportSizes" | "qlMixedDisplayResolution" | "resultPreviewContent" | "resultPreviewZoom" | "savedWorkbenchLayouts" | "selectedProfile" | "setPreviewViewportSizes" | "setWorkspaceProfileBaseline" | "setWorkspaceProfileBaselinePending" | "sourcePreviewContent" | "sourcePreviewZoom" | "workbenchPreviewLayer" | "workbenchResultFloating" | "workbenchSourceFloating" | "workbenchWindowLayouts" | "workspaceLayout" | "workspaceProfileBaseline" | "workspaceProfileBaselinePending"> &
    Pick<ReturnType<typeof useWorkbenchWindows>, "bitmapEditorActiveSide"> &
    Pick<ReturnType<typeof useWorkbenchLayout>, "applyWorkspaceLayout" | "selectWorkspaceProfile" | "workspaceProfileOptions"> &
    Pick<ReturnType<typeof useConversionSettings>, "conversionSettings"> &
    Pick<ReturnType<typeof usePreviewInspection>, "currentWorkspaceProfileSnapshotKey" | "displayedResult" | "updateBitmapEditorNavigatorViewport"> &
    Pick<ReturnType<typeof usePreviewSizing>, "previewAspect" | "previewAspectRatio" | "resultZoom" | "sourceStageAspect" | "sourceZoom">,
) {
  const sourceStageAspectRatio = `${sourceStageAspect.width} / ${sourceStageAspect.height}`;
  const sourceStageWidth = sourceZoom !== "fit"
    ? `${sourceStageAspect.width * Number(sourceZoom)}px`
    : undefined;
  const resultStageAspectRatio = resultPreviewContent === "source-image" && image !== null
    ? `${image.width} / ${image.height}`
    : previewAspectRatio;
  const resultStageWidth = resultPreviewContent === "source-image" && image !== null && resultZoom !== "fit"
    ? `${image.width * resultZoom}px`
    : resultZoom === "fit" ? undefined : `${previewAspect.width * Number(resultZoom)}px`;

  useLayoutEffect(() => {
    const measure = (viewport: HTMLDivElement | null): { readonly width: number; readonly height: number } => {
      if (viewport === null) return { width: 0, height: 0 };
      const bounds = viewport.getBoundingClientRect();
      const styles = window.getComputedStyle(viewport);
      const horizontalInset = [styles.paddingLeft, styles.paddingRight, styles.borderLeftWidth, styles.borderRightWidth]
        .reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
      const verticalInset = [styles.paddingTop, styles.paddingBottom, styles.borderTopWidth, styles.borderBottomWidth]
        .reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
      return {
        width: Math.max(0, bounds.width - horizontalInset),
        height: Math.max(0, bounds.height - verticalInset),
      };
    };
    const update = (): void => {
      const next = {
        source: measure(sourceViewportRef.current),
        result: measure(resultViewportRef.current),
      };
      setPreviewViewportSizes((current) => current.source.width === next.source.width &&
          current.source.height === next.source.height &&
          current.result.width === next.result.width &&
          current.result.height === next.result.height
        ? current
        : next);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (sourceViewportRef.current !== null) observer?.observe(sourceViewportRef.current);
    if (resultViewportRef.current !== null && resultViewportRef.current !== sourceViewportRef.current) {
      observer?.observe(resultViewportRef.current);
    }
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [sourcePreviewContent, resultPreviewContent, sourceZoom, resultZoom, sourceStageAspectRatio,
    resultStageAspectRatio, workbenchSourceFloating, workbenchResultFloating, workbenchPreviewLayer,
    workbenchWindowLayouts.source.dock, workbenchWindowLayouts.source.minimized,
    workbenchWindowLayouts.result.dock, workbenchWindowLayouts.result.minimized]);

  useLayoutEffect(() => {
    if (bitmapEditorActiveSide === null) return;
    const frame = window.requestAnimationFrame(updateBitmapEditorNavigatorViewport);
    return () => window.cancelAnimationFrame(frame);
  }, [bitmapEditorActiveSide, sourcePreviewZoom, resultPreviewZoom, previewViewportSizes]);

  const selectedModePalette =
    selectedProfile.palette.modes[targetModeId] ??
    selectedProfile.palette.modes[
      selectedProfile.presets[0]?.settings.modeId ?? ""
    ];
  const selectedPaletteScreens = (() => {
    if (selectedModePalette === undefined || !isPmd) return selectedModePalette?.screens ?? [];
    try {
      return profileModeScreens(selectedProfile, targetModeId, pmd85PaletteCalibrationId);
    } catch {
      return selectedModePalette.screens;
    }
  })();
  const paletteOptionsByScreen = selectedPaletteScreens.map(
    (screen) => screen.colors.map((color) => ({
      code: color.id,
      name: color.name,
      normal: color.normal,
      bright: color.bright ?? color.normal,
    })),
  );
  const effectivePaletteOptionsByScreen = isZx
    ? Array.from({ length: paletteSelections.length }, () => zxPaletteOptions)
    : paletteOptionsByScreen;
  const zxFlashPreviewPhaseActive = workspaceMode === "palette" && (
    bitmapEditorFlashPreviewMode === "inverted" ||
    (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase)
  );
  const liveFramePreviewRgba = (
    result: WorkerConversionResult,
    frameIndex: number,
  ): Uint8Array | undefined => {
    const frame = result.frames[frameIndex];
    if (frame === undefined) return undefined;
    return result.platformId === "zx-spectrum" &&
        result.attributeHeight !== null && zxFlashPreviewPhaseActive
      ? renderZxFlashPreview(frame.encoded, result.attributeHeight, true, resolvedZxPalette)
      : frame.previewRgba;
  };
  const liveMergedPreviewRgba = (result: WorkerConversionResult): Uint8Array => {
    if (result.platformId !== "zx-spectrum" || !zxFlashPreviewPhaseActive) {
      return result.mergedPreviewRgba;
    }
    const first = liveFramePreviewRgba(result, 0);
    if (first === undefined) return result.mergedPreviewRgba;
    const second = liveFramePreviewRgba(result, 1);
    return second === undefined ? first : mergeTemporalRgba(first, second);
  };
  const spatialAnalyticPreview = targetModeId.includes("vertical-spatial") &&
    (outputPreviewStage === "merged" || outputPreviewStage === "screen-2");
  const outputPaletteColors = (outputPreviewStage === "merged" || spatialAnalyticPreview) &&
      displayedResult !== null
    ? distinctPreviewColors(
        displayedResult.platformId === "sinclair-ql" &&
          displayedResult.modeId === "mode8-mode4-mixed-512x256" &&
          displayedResult.frames[0] !== undefined &&
          displayedResult.frames[1] !== undefined
          ? renderQlMixedDisplayPreview(
              displayedResult.frames[0].previewRgba,
              displayedResult.frames[1].previewRgba,
              displayedResult.width,
              qlMixedDisplayResolution,
            )
          : displayedResult.verticalSpatialDiagnostics !== undefined &&
              displayedResult.platformId === "zx-spectrum" &&
              zxFlashPreviewPhaseActive
            ? buildVerticalSpatialAnalyticPreview(
                liveFramePreviewRgba(displayedResult, 0) ?? displayedResult.frames[0]?.previewRgba ?? displayedResult.verticalSpatialDiagnostics.analyticPreviewRgba,
                displayedResult.width,
                displayedResult.height,
              )
            : displayedResult.verticalSpatialDiagnostics?.analyticPreviewRgba ??
              liveMergedPreviewRgba(displayedResult),
      ).map((color) => ({
        key: color,
        background: color,
        title: color.toUpperCase(),
      }))
    : (() => {
        const screenIndex = outputPreviewStage === "screen-2" ? 1 : 0;
        const resultSelections = displayedResult?.paletteSelections ?? paletteSelections;
        const selection = resultSelections[screenIndex] ?? resultSelections[0];
        if (selection === undefined) return [];
        return selection.enabledColorIds.flatMap((color) => {
          const option = (
            effectivePaletteOptionsByScreen[screenIndex] ??
            effectivePaletteOptionsByScreen[0] ??
            []
          ).find((candidate) => candidate.code === color);
          if (option === undefined) return [];
          const background = isZx && selection.brightMode === "auto"
            ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
            : isZx && selection.brightMode === "on"
              ? option.bright
              : option.normal;
          return [{
            key: `${screenIndex}-${color}`,
            background,
            title: option.name,
          }];
        });
      })();
  const differencePreviewDataUrl = useMemo(() => {
    const frame = displayedResult?.frames[0];
    if (displayedResult === null || frame === undefined) return null;
    const resultRgba = liveFramePreviewRgba(displayedResult, 0) ?? frame.previewRgba;
    return rgbaPngDataUrl(
      previewDifferenceHeatmap(displayedResult.sourcePreviewRgba, resultRgba),
      displayedResult.width,
      displayedResult.height,
    );
  }, [displayedResult, bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase]);
  const mixedScreenWindowImages = useMemo(() => {
    if (displayedResult === null) return null;
    const first = displayedResult.frames[0];
    const second = displayedResult.frames[1];
    if (first === undefined) return null;
    const width = displayedResult.width;
    const height = displayedResult.height;
    const encode = (rgba: Uint8Array) => rgbaPngDataUrl(rgba, width, height);
    const framePreview = (frame: typeof first): Uint8Array =>
      liveFramePreviewRgba(displayedResult, displayedResult.frames.indexOf(frame)) ?? frame.previewRgba;
    const previews: Partial<Record<"screen-1" | "screen-2" | "merged-low" | "merged-high", string>> = {};
    if (displayedResult.verticalSpatialDiagnostics !== undefined) {
      const physicalPreview = framePreview(first);
      previews["screen-1"] = encode(physicalPreview);
      const analyticPreview = displayedResult.platformId === "zx-spectrum" && zxFlashPreviewPhaseActive
        ? buildVerticalSpatialAnalyticPreview(physicalPreview, width, height)
        : displayedResult.verticalSpatialDiagnostics.analyticPreviewRgba;
      previews["screen-2"] = rgbaPngDataUrl(analyticPreview, width, height / 2);
      return previews;
    }
    if (second === undefined) return null;
    const firstPreview = framePreview(first);
    const secondPreview = framePreview(second);
    previews["screen-1"] = encode(firstPreview);
    previews["screen-2"] = encode(secondPreview);
    if (displayedResult.platformId === "sinclair-ql" &&
      displayedResult.modeId === "mode8-mode4-mixed-512x256") {
      previews["merged-low"] = encode(renderQlMixedDisplayPreview(first.previewRgba, second.previewRgba, width, "low"));
      previews["merged-high"] = encode(renderQlMixedDisplayPreview(first.previewRgba, second.previewRgba, width, "high"));
    }
    return previews;
  }, [displayedResult, bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase]);
  const preAttributePreviewDataUrl = displayedResult === null
    ? null
    : rgbaPngDataUrl(
        displayedResult.preConstraintPreviewRgba,
        displayedResult.width,
        displayedResult.height,
      );
  const windowImageFor = (content: PreviewContent) => {
    if (content === "pre-attribute") {
      return preAttributePreviewDataUrl === null
        ? <p>Convert an image to view the pre-attribute dither stage.</p>
        : <img className="preview-difference-image" src={preAttributePreviewDataUrl} alt="Pre-attribute dither preview" />;
    }
    if (mixedScreenWindowImages === null || !(content in mixedScreenWindowImages)) {
      return <p>Convert a mixed two-screen target to view this stage.</p>;
    }
    const image = mixedScreenWindowImages[content as keyof typeof mixedScreenWindowImages];
    return typeof image === "string"
      ? <img className="preview-difference-image" src={image} alt={`${content} preview`} />
      : <p>This preview is not available for the selected target.</p>;
  };
  const retainedDraftVisible = draftPreviewResult(draftState) !== null;
  const bitmapEditorEdited = bitmapEditorOriginalResult !== null || bitmapEditorRevertSource !== null || bitmapEditorResultEdited;
  const platformLabel = isQl ? "Sinclair QL" : isPmd ? "Tesla PMD 85" : "ZX Spectrum";
  const paletteResultLabel = draftState.kind === "ready"
    ? `${platformLabel} result · Draft preview`
    : retainedDraftVisible &&
        (draftState.kind === "scheduled" || draftState.kind === "running")
      ? `${platformLabel} result · Draft updating`
    : state.kind === "stale" ? `${platformLabel} result · stale High`
    : state.kind === "ready" ? `${platformLabel} result · completed High${bitmapEditorEdited ? " · edited" : ""}`
    : `${platformLabel} result`;
  const resultLabel = workspaceMode === "tilemap"
    ? `Tilemap reconstruction${
        tilemapStale ? " · stale" :
        charsetState.kind === "running" ? " · converting" :
        charsetState.kind === "ready" ? tileEditorEdited ? " · edited" : " · current" : ""
      }`
      : paletteResultLabel;
  const comparisonKind = workspaceMode === "tilemap"
    ? "tilemap"
    : workspaceLayout === "dithering"
      ? "dithering"
      : "palette";
  const hasMixedScreenTarget = targetModeId === "zx48-mixed-256x192" ||
    targetModeId === "mode8-256x256" ||
    targetModeId === "mode4-512x256" ||
    targetModeId === "mode8-mode4-mixed-512x256";
  const hasVerticalSpatialTarget = targetModeId.includes("vertical-spatial");
  const hasQlMixedResolutionTarget = targetModeId === "mode8-mode4-mixed-512x256";
  const paletteConversionStatusText = state.kind === "idle" ? image === null
    ? "Import an image to begin."
    : draftState.kind === "scheduled" ? "Draft preview scheduled…"
    : draftState.kind === "running" ? "Running Draft preview…"
    : draftState.kind === "ready" ? `Draft preview current · score ${draftState.result.score.toLocaleString()}.${sharedBitmapDiagnosticsText(draftState.result)}`
    : draftState.kind === "error" ? `Draft failed: ${draftState.message}`
    : "Ready for High conversion."
    : state.kind === "running"
      ? "Running High conversion… The current preview remains visible."
      : state.kind === "ready"
        ? state.result.frames.length > 1
          ? `Completed final · ${state.result.frames.length} × ${state.result.scr.length.toLocaleString()} bytes · ${state.result.width}×${state.result.height} · score ${state.result.score.toLocaleString()}${bitmapEditorResultEdited ? " · metrics pre-edit" : ""}.${sharedBitmapDiagnosticsText(state.result)}`
          : state.result.platformId === "zx-spectrum"
            ? `Completed final · ${state.result.artifact.length.toLocaleString()} / ${zxSoftwareScrBytes(attributeHeight).toLocaleString()} bytes · 8×${attributeHeight} attributes · score ${state.result.score.toLocaleString()}${bitmapEditorResultEdited ? " · metrics pre-edit" : ""}.${sharedBitmapDiagnosticsText(state.result)}`
            : `Completed final · ${state.result.artifact.length.toLocaleString()} bytes · ${state.result.width}×${state.result.height} · score ${state.result.score.toLocaleString()}${bitmapEditorResultEdited ? " · metrics pre-edit" : ""}.`
        : state.kind === "stale"
          ? draftState.kind === "scheduled"
            ? "Draft preview scheduled · prior preview remains visible."
            : draftState.kind === "running"
              ? "Running Draft preview… The prior preview remains visible."
              : draftState.kind === "ready"
                ? "Draft preview current · prior High result is stale and cannot be exported."
                : draftState.kind === "error"
                  ? `Draft failed: ${draftState.message} The prior preview remains visible.`
                  : "Prior High result is stale and cannot be exported."
          : `Failed: ${state.message}`;
  const conversionStatusText = workspaceMode === "tilemap"
    ? state.kind === "running" || charsetState.kind === "running"
      ? "Running Palette High followed by Tilemap High…"
      : charsetState.kind === "error"
        ? `Tilemap failed: ${charsetState.message}`
      : tilemapStale
          ? "Palette source changed · tilemap reconstruction is stale."
          : charsetState.kind === "ready"
            ? specsciiDocumentName !== null && image === null
              ? `Specscii screen loaded · ${charsetState.result.characterCount} characters · ready to edit or export.`
              : `Tilemap High current · ${charsetState.result.characterCount} characters · ${charsetState.result.artifact.length.toLocaleString()} bytes.`
            : image === null
              ? "Import an image to begin."
              : "Ready for Tilemap High conversion."
      : paletteConversionStatusText;

  useEffect(() => {
    if (workspaceProfileBaseline !== "" && !workspaceProfileBaselinePending) return;
    const storedProfile = workspaceProfileBaselinePending
      ? undefined
      : savedWorkbenchLayouts.find((layout) => layout.id === activeWorkspaceProfileId);
    setWorkspaceProfileBaseline(storedProfile === undefined
      ? currentWorkspaceProfileSnapshotKey
      : workspaceProfileSnapshotKey(storedProfile));
    setWorkspaceProfileBaselinePending(false);
  }, [currentWorkspaceProfileSnapshotKey, workspaceProfileBaseline, workspaceProfileBaselinePending, activeWorkspaceProfileId, savedWorkbenchLayouts]);

  useEffect(() => {
    if (workspaceProfileOptions.some(({ id }) => id === activeWorkspaceProfileId)) return;
    const fallback = workspaceProfileOptions.find(({ kind }) => kind === "builtin") ?? workspaceProfileOptions[0];
    if (fallback?.kind === "builtin" && fallback.layout !== undefined) applyWorkspaceLayout(fallback.layout);
    else if (fallback !== undefined) selectWorkspaceProfile(fallback.id);
  }, [activeWorkspaceProfileId, hiddenBuiltinWorkspaceProfileIds, savedWorkbenchLayouts]);

  const flickerSuppressionEffective = effectiveScreenFlickerSuppression(conversionSettings);
  const flickerSuppressionPolicyMismatch =
    targetModeId !== "mode8-mode4-mixed-512x256" &&
    paletteSelections.length === 2 &&
    !paletteSelectionsMatch(paletteSelections[0]!, paletteSelections[1]!);

  return {
    comparisonKind,
    conversionStatusText,
    differencePreviewDataUrl,
    effectivePaletteOptionsByScreen,
    flickerSuppressionEffective,
    flickerSuppressionPolicyMismatch,
    hasMixedScreenTarget,
    hasQlMixedResolutionTarget,
    hasVerticalSpatialTarget,
    outputPaletteColors,
    resultLabel,
    resultStageAspectRatio,
    resultStageWidth,
    selectedModePalette,
    sourceStageAspectRatio,
    sourceStageWidth,
    windowImageFor,
  };
}
