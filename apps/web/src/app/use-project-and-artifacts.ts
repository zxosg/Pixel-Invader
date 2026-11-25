import { ConversionWorkerClient, type WorkerCharsetResult, type WorkerConversionResult, type WorkerDecodedImage } from "../worker/client.js";
import { normalizeProjectName } from "../project-name.js";
import { BUILT_IN_PROFILES, type ConversionProfile, parseImportedProfile, profileModeScreens } from "../profiles.js";
import { assertValidSoftwareScr, ZX_BITMAP_BYTES } from "@retro-converter/zx-spectrum";
import { qlHardwareModesForTarget, type QlTargetModeId, renderZxFlashPreview, resolveZxPalette } from "@retro-converter/conversion-core";
import { assertValidQlScreen, type QlMode } from "@retro-converter/sinclair-ql";
import { assertValidPmd85Screen, extractPmd85GapBytes, type Pmd85ModeId } from "@retro-converter/pmd-85";
import { hexToRgb } from "../dithering-labels.js";
import { createNativeResultBitmap } from "../result-bitmap-editor.js";
import { unpackZxBitmap } from "../conversion-targets.js";
import { encodeLegacyCharsetArtifact } from "@retro-converter/zx-charset";
import { buildConversionMetadata, canonicalJsonStringify, sanitizeArtifactBaseName, sha256Hex } from "../artifacts.js";
import { clampCharsetRange } from "../specscii-assets.js";
import { previewDifferenceHeatmap, rgbaPngDataUrl, zxScreenContainsFlash } from "../preview-metrics.js";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { mergeTemporalRgba, zxBitmapToMonochromeRgba } from "../monochrome-preview.js";
import { summarizePaletteUsage, ZX_BASE_COLORS } from "../inspection.js";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useResultEditing } from "./use-result-editing.js";
import type { useConversionSettings } from "./use-conversion-settings.js";
import type { useConversionActions } from "./use-conversion-actions.js";
import type { usePreviewInspection } from "./use-preview-inspection.js";
import type { useEditorOperations } from "./use-editor-operations.js";
import { directPmd85Result, expandResultPreviewForFrame } from "./result-editing-helpers.js";
import { equalBytes } from "./project-and-artifacts-helpers.js";

export function useProjectAndArtifacts(
  { applySettings, attributeHeight, benchmarkCompareDigests, benchmarkRows, bitmapEditorBuffer, bitmapEditorClipboard, bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase, bitmapEditorFullBufferRef, bitmapEditorMergedFlashCanvasRef, bitmapEditorPasteMode, bitmapEditorRegionSelection, bitmapEditorResultBuffer, bitmapEditorResultBufferRef, bitmapEditorResultCanvasRef, bitmapEditorResultEdited, bitmapEditorResultFrameIndex, bitmapEditorResultSourceRef, bitmapEditorSelectionDraft, bitmapEditorSelectionPointerRef, bitmapEditorShowAttributes, bitmapEditorShowPixels, bitmapEditorSourceCanvasRef, bitmapEditorTarget, borderColor, charsetState, cropHeight, cropSelectionActive, cropSourceSize, cropValid, cropWidth, cropX, cropY, dirty, displayedResult, draftState, existingCharset, existingCharsetSelectionRef, fullBitmapBufferFromSource, image, initializeResultEditor, initializeTileEditor, lastFinal, lastFinalCompletedAt, outputPreviewStage, paletteUsageFilter, pendingOpenedFinalRef, pendingOpenedResultEditedRef, pendingOpenedResultQualityRef, profiles, resultFrameInput, resultPreviewContent, setBitmapEditorBuffer, setBitmapEditorFlashPreviewMode, setBitmapEditorFlashPreviewPhase, setBitmapEditorRevertSource, setCharsetAllowPolarity, setCharsetAllowTransforms, setCharsetBudget, setCharsetDistance, setCharsetEncoding, setCharsetSelectionMode, setCharsetSource, setCharsetState, setCharsetStrategy, setCharsetTilesView, setCharsetVisualWeighting, setEmittedSourceCharsetIndices, setExistingCharset, setExistingCharsetLength, setExistingCharsetLengthEntry, setExistingCharsetName, setExistingCharsetSelection, setExistingCharsetStart, setExistingCharsetStartEntry, setExportError, setImage, setImageStatus, setOriginalImage, setProfiles, setProjectName, setResultOrigin, setSelectedPresetId, setSelectedProfileId, setSelectedSourceCharsetTile, setSourceArtifact, setSourceFileName, setSourceFrameIndex, setTilemapStale, setWorkspaceMode, sourceArtifact, sourcePreviewContent, specsciiDocumentName, state, tilemapStale, workbenchPreviewLayer, workbenchResultFloating, workbenchSourceFloating, workspaceMode, workspaceModeRef, zxPaletteDefinition }: Pick<ReturnType<typeof useRuntimeState>, "bitmapEditorBuffer" | "bitmapEditorClipboard" | "bitmapEditorFlashPreviewMode" | "bitmapEditorFlashPreviewPhase" | "bitmapEditorFullBufferRef" | "bitmapEditorMergedFlashCanvasRef" | "bitmapEditorPasteMode" | "bitmapEditorRegionSelection" | "bitmapEditorResultBuffer" | "bitmapEditorResultBufferRef" | "bitmapEditorResultCanvasRef" | "bitmapEditorResultEdited" | "bitmapEditorResultFrameIndex" | "bitmapEditorResultSourceRef" | "bitmapEditorSelectionDraft" | "bitmapEditorSelectionPointerRef" | "bitmapEditorShowAttributes" | "bitmapEditorShowPixels" | "bitmapEditorSourceCanvasRef" | "bitmapEditorTarget" | "charsetState" | "draftState" | "existingCharsetSelectionRef" | "lastFinal" | "pendingOpenedFinalRef" | "pendingOpenedResultEditedRef" | "pendingOpenedResultQualityRef" | "setBitmapEditorBuffer" | "setBitmapEditorFlashPreviewMode" | "setBitmapEditorFlashPreviewPhase" | "setBitmapEditorRevertSource" | "setCharsetState" | "state" | "workspaceModeRef"> &
    Pick<ReturnType<typeof useSettingsState>, "attributeHeight" | "borderColor" | "dirty" | "existingCharset" | "image" | "lastFinalCompletedAt" | "profiles" | "setCharsetAllowPolarity" | "setCharsetAllowTransforms" | "setCharsetBudget" | "setCharsetDistance" | "setCharsetEncoding" | "setCharsetSelectionMode" | "setCharsetSource" | "setCharsetStrategy" | "setCharsetTilesView" | "setCharsetVisualWeighting" | "setEmittedSourceCharsetIndices" | "setExistingCharset" | "setExistingCharsetLength" | "setExistingCharsetLengthEntry" | "setExistingCharsetName" | "setExistingCharsetSelection" | "setExistingCharsetStart" | "setExistingCharsetStartEntry" | "setExportError" | "setImage" | "setImageStatus" | "setOriginalImage" | "setProfiles" | "setProjectName" | "setResultOrigin" | "setSelectedPresetId" | "setSelectedProfileId" | "setSelectedSourceCharsetTile" | "setSourceArtifact" | "setSourceFileName" | "setSourceFrameIndex" | "setTilemapStale" | "setWorkspaceMode" | "sourceArtifact" | "specsciiDocumentName" | "tilemapStale" | "workspaceMode" | "zxPaletteDefinition"> &
    Pick<ReturnType<typeof useWorkbenchState>, "benchmarkCompareDigests" | "benchmarkRows" | "cropSelectionActive" | "outputPreviewStage" | "paletteUsageFilter" | "resultPreviewContent" | "sourcePreviewContent" | "workbenchPreviewLayer" | "workbenchResultFloating" | "workbenchSourceFloating"> &
    Pick<ReturnType<typeof useResultEditing>, "applySettings" | "initializeResultEditor" | "resultFrameInput"> &
    Pick<ReturnType<typeof useConversionSettings>, "cropHeight" | "cropSourceSize" | "cropValid" | "cropWidth" | "cropX" | "cropY"> &
    Pick<ReturnType<typeof useConversionActions>, "initializeTileEditor"> &
    Pick<ReturnType<typeof usePreviewInspection>, "displayedResult"> &
    Pick<ReturnType<typeof useEditorOperations>, "fullBitmapBufferFromSource">,
) {
  async function openProject(file: File | undefined) {
    if (file === undefined) return;
    if (dirty && !window.confirm("Replace the current unsaved work with this project?")) return;
    setBitmapEditorFlashPreviewMode("normal");
    setBitmapEditorFlashPreviewPhase(false);
    const verifier = new ConversionWorkerClient();
    try {
      const validated = await (await import("../projects.js")).validateCompletedProject(new Uint8Array(await file.arrayBuffer()));
      const rawProfile = validated.profile as Record<string, unknown>;
      if (
        typeof rawProfile.id !== "string" ||
        typeof rawProfile.version !== "string" ||
        typeof rawProfile.name !== "string"
      ) {
        throw new Error("PROJECT_SCHEMA_INVALID: profile snapshot is incomplete.");
      }
      const archivedProfile = validated.profile as ConversionProfile;
      const projectProfile = BUILT_IN_PROFILES.find(
        (profile) => profile.id === rawProfile.id,
      ) ?? await parseImportedProfile(
        new TextEncoder().encode(JSON.stringify(rawProfile)),
      );
      const sourceBytes = Uint8Array.from(validated.sourceBytes);
      if (validated.resultEdited) {
        for (const [index, frame] of validated.frames.entries()) {
          if (validated.settings.platformId === "zx-spectrum") {
            assertValidSoftwareScr(frame, validated.settings.attributeHeight);
          } else if (validated.settings.platformId === "sinclair-ql") {
            const hardwareMode = (index === 0
              ? qlHardwareModesForTarget(validated.settings.modeId as QlTargetModeId)[0]
              : qlHardwareModesForTarget(validated.settings.modeId as QlTargetModeId)[Math.min(index, 1)]) as QlMode | undefined;
            if (hardwareMode === undefined) throw new Error("PROJECT_SCHEMA_INVALID: edited QL frame mode is missing.");
            assertValidQlScreen(frame, hardwareMode);
          } else {
            assertValidPmd85Screen(frame);
          }
        }
      }
      let decoded: WorkerDecodedImage;
      let workingDecoded: WorkerDecodedImage;
      let recomputed: WorkerConversionResult;
      let recoveredWorkingSource = false;
      const projectPmdPalette = validated.settings.platformId === "pmd-85"
        ? profileModeScreens(
            projectProfile,
            validated.settings.modeId,
            validated.settings.pmd85.paletteCalibrationId,
          )[0]?.colors.map((color) => hexToRgb(color.normal)) ?? []
        : undefined;
      if (validated.sourceFormat === "pmd85-bin") {
        const colors = projectPmdPalette ?? [];
        const imported = await verifier.decodePmd85(
          Uint8Array.from(sourceBytes).buffer,
          validated.settings.modeId as Pmd85ModeId,
          colors,
          validated.settings.pmd85.paletteCalibrationId,
        );
        decoded = imported.image;
        workingDecoded = validated.workingSourcePng === undefined
          ? decoded
          : await verifier.decodeImage(Uint8Array.from(validated.workingSourcePng).buffer);
        recomputed = validated.workingSourcePng === undefined && validated.resultOrigin === "direct-import"
          ? directPmd85Result(imported, validated.settings)
          : await verifier.convertImage(
              workingDecoded,
              validated.settings,
              "high",
              {
                foregroundPalette: colors,
                ...(validated.settings.pmd85.gapPolicy === "preserve-imported"
                  ? { importedGapBytes: extractPmd85GapBytes(sourceBytes) }
                  : {}),
              },
            );
      } else {
        decoded = await verifier.decodeImage(Uint8Array.from(sourceBytes).buffer, validated.sourceFrameIndex);
        workingDecoded = validated.workingSourcePng === undefined
          ? decoded
          : await verifier.decodeImage(Uint8Array.from(validated.workingSourcePng).buffer);
        if (validated.workingSourcePng !== undefined &&
            (workingDecoded.width !== decoded.width || workingDecoded.height !== decoded.height)) {
          const fallback = await verifier.convertImage(
            decoded,
            validated.settings,
            "high",
            projectPmdPalette === undefined
              ? undefined
              : { foregroundPalette: projectPmdPalette },
          );
          const archivedPreview = await verifier.decodeImage(
            Uint8Array.from(validated.previewPng).buffer,
          );
          const outputMatches = fallback.frames.length === validated.frames.length &&
            fallback.frames.every((frame, index) =>
              equalBytes(frame.encoded, validated.frames[index] ?? new Uint8Array())
            ) &&
            archivedPreview.width === fallback.width &&
            archivedPreview.height === fallback.height &&
            equalBytes(archivedPreview.rgba, fallback.mergedPreviewRgba);
          if (!outputMatches) {
            throw new Error(
              "PROJECT_WORKING_SOURCE_INVALID: working source dimensions do not match the original source and the archived result cannot be recovered.",
            );
          }
          workingDecoded = decoded;
          recomputed = fallback;
          recoveredWorkingSource = true;
        } else {
          recomputed = await verifier.convertImage(
            workingDecoded,
            validated.settings,
            "high",
            projectPmdPalette === undefined
              ? undefined
              : { foregroundPalette: projectPmdPalette },
          );
        }
      }
      const archivedFramesDiffer = recomputed.frames.length !== validated.frames.length ||
        recomputed.frames.some((frame, index) =>
          !equalBytes(frame.encoded, validated.frames[index] ?? new Uint8Array())
        );
      // Projects written before result_edited was introduced could already
      // contain a manually edited native screen. Preserve that archived
      // screen instead of rejecting an otherwise valid project when the
      // current converter produces a byte-level difference.
      const legacyArchivedResultEdited = !validated.resultEdited &&
        !validated.resultEditedFieldPresent && archivedFramesDiffer;
      const archivedResultEdited = validated.resultEdited || legacyArchivedResultEdited;
      const archivedResultSnapshot = archivedResultEdited || validated.resultQuality === "Draft";
      const verifyArchivedResult = !archivedResultSnapshot &&
        (validated.workingSourcePng === undefined || recoveredWorkingSource);
      if (verifyArchivedResult && archivedFramesDiffer) {
        throw new Error("PROJECT_REPRODUCTION_FAILED: screen bytes differ.");
      }
      const archivedPreview = await verifier.decodeImage(Uint8Array.from(validated.previewPng).buffer);
      const expectedArchivedPreview = recomputed.verticalSpatialDiagnostics;
      if (verifyArchivedResult && (
        archivedPreview.width !== (expectedArchivedPreview?.logicalWidth ?? recomputed.width) ||
        archivedPreview.height !== (expectedArchivedPreview?.logicalHeight ?? recomputed.height) ||
        !equalBytes(
          archivedPreview.rgba,
          expectedArchivedPreview?.analyticPreviewRgba ?? recomputed.mergedPreviewRgba,
        )
      )) throw new Error("PROJECT_REPRODUCTION_FAILED: decoded preview pixels differ.");
      if (archivedResultSnapshot) {
        const editedFrames = recomputed.frames.map((frame, index) => {
          const encoded = validated.frames[index];
          if (encoded === undefined) throw new Error("PROJECT_SCHEMA_INVALID: edited result frame is missing.");
          const input = resultFrameInput(recomputed, index, {
            encoded,
            pmd85GapPolicy: validated.settings.pmd85.gapPolicy,
            ...(projectPmdPalette === undefined ? {} : { pmd85Palette: projectPmdPalette }),
            ...(validated.sourceFormat === "pmd85-bin" && validated.settings.pmd85.gapPolicy === "preserve-imported"
              ? { importedGapBytes: extractPmd85GapBytes(sourceBytes) }
              : {}),
          });
          if (input === null) throw new Error("PROJECT_SCHEMA_INVALID: edited result frame is invalid.");
          const bitmap = createNativeResultBitmap(input);
          return {
            ...frame,
            encoded: bitmap.encoded,
            paletteIndices: bitmap.paletteIndices,
            previewRgba: expandResultPreviewForFrame(bitmap, frame),
          };
        });
        const editedPreview = archivedPreview.rgba;
        recomputed = {
          ...recomputed,
          artifact: editedFrames[0]?.encoded.slice() ?? recomputed.artifact.slice(),
          scr: editedFrames[0]?.encoded.slice() ?? recomputed.scr.slice(),
          frames: editedFrames,
          previewRgba: editedPreview.slice(),
          mergedPreviewRgba: editedPreview.slice(),
          ...(recomputed.verticalSpatialDiagnostics === undefined
            ? {}
            : {
                verticalSpatialDiagnostics: {
                  ...recomputed.verticalSpatialDiagnostics,
                  analyticPreviewRgba: editedPreview.slice(),
                },
              }),
          ...(recomputed.platformId === "zx-spectrum" && editedFrames[0] !== undefined
            ? {
                pixels: unpackZxBitmap(editedFrames[0].encoded),
                attributes: editedFrames[0].encoded.slice(6144),
                screen: {
                  pixels: unpackZxBitmap(editedFrames[0].encoded),
                  attributes: editedFrames[0].encoded.slice(6144),
                },
              }
            : {}),
        };
      }
      let verifiedTilemap: WorkerCharsetResult | null = null;
      let repairedLegacyCharsetSelection = false;
      if (validated.workspaceMode === "tilemap") {
        if (validated.tilemap === undefined) {
          throw new Error(
            "PROJECT_ENTRY_MISSING: tilemap settings and artifacts are required.",
          );
        }
        verifiedTilemap = await verifier.convertCharset(
          recomputed.frames[0]!.encoded,
          {
            ...validated.tilemap.settings,
            ...(validated.tilemap.settings.source === "existing"
              ? { existingCharset: validated.tilemap.sourceCharset }
              : {}),
          },
        );
        const legacyTilemapArtifact = encodeLegacyCharsetArtifact({
          encoding: verifiedTilemap.encoding,
          characterCount: verifiedTilemap.characterCount,
          transformations: verifiedTilemap.transformations,
          characterIndices: Uint8Array.from(
            verifiedTilemap.assignments,
            (assignment) => assignment.characterIndex,
          ),
          attributes: verifiedTilemap.attributes,
          transforms: Uint8Array.from(
            verifiedTilemap.assignments,
            (assignment) => assignment.transform,
          ),
          charset: verifiedTilemap.charset,
        });
        const artifactMatchesCurrent = equalBytes(
          verifiedTilemap.artifact,
          validated.tilemap.artifact,
        );
        const artifactMatchesLegacy = equalBytes(
          legacyTilemapArtifact,
          validated.tilemap.artifact,
        );
        if (!artifactMatchesCurrent && !artifactMatchesLegacy) {
          const selection =
            validated.tilemap.settings.existingCharsetSelection?.indices;
          const legacyFirstCharacters = selection === undefined
            ? null
            : validated.tilemap.sourceCharset.slice(
                0,
                selection.length * 8,
              );
          if (
            validated.tilemap.settings.source !== "existing" ||
            legacyFirstCharacters === null ||
            !equalBytes(
              validated.tilemap.charset,
              legacyFirstCharacters,
            )
          ) {
            throw new Error(
              "PROJECT_REPRODUCTION_FAILED: tilemap artifact bytes differ.",
            );
          }
          repairedLegacyCharsetSelection = true;
        }
        const archivedTilemapPreview = await verifier.decodeImage(
          Uint8Array.from(validated.tilemap.previewPng).buffer,
        );
        if (
          !repairedLegacyCharsetSelection &&
          (
            archivedTilemapPreview.width !== 256 ||
            archivedTilemapPreview.height !== 192 ||
            !equalBytes(
              archivedTilemapPreview.rgba,
              verifiedTilemap.previewRgba,
            )
          )
        ) {
          throw new Error(
            "PROJECT_REPRODUCTION_FAILED: tilemap preview pixels differ.",
          );
        }
      }

      const archivedMetadata = JSON.parse(new TextDecoder().decode(validated.metadataJson)) as Record<string, unknown>;
      const archivedConversion = archivedMetadata.conversion as Record<string, unknown> | undefined;
      const archivedSettings = archivedConversion?.settings as Record<string, unknown> | undefined;
      if (archivedSettings !== undefined && archivedSettings.borderColor === undefined) {
        archivedSettings.borderColor = validated.settings.borderColor;
      }
      const completedAtUtc = typeof archivedMetadata.completed_at_utc === "string"
        ? archivedMetadata.completed_at_utc : new Date().toISOString();
      const rebuiltMetadata = await buildConversionMetadata({
        sourceSha256: await sha256Hex(sourceBytes),
        sourceFormat: decoded.format,
        sourceWidth: decoded.width,
        sourceHeight: decoded.height,
        settings: validated.settings,
        scr: recomputed.scr,
        frames: recomputed.frames.map((frame) => frame.encoded),
        previewRgba: recomputed.mergedPreviewRgba,
        width: recomputed.width,
        height: recomputed.height,
        score: recomputed.score,
        resultQuality: validated.resultQuality,
        ...(recomputed.verticalSpatialDiagnostics === undefined
          ? {}
          : { verticalSpatialDiagnostics: recomputed.verticalSpatialDiagnostics }),
        completedAtUtc,
        profile: archivedProfile,
      }) as Record<string, unknown>;
      const projection = archivedMetadata.deterministic_projection;
      if (!Array.isArray(projection)) {
        throw new Error("PROJECT_REPRODUCTION_FAILED: deterministic metadata projection is invalid.");
      }
      const differingMetadataKeys = verifyArchivedResult
        ? projection.filter((key) =>
        typeof key !== "string" ||
        canonicalJsonStringify(archivedMetadata[key]) !== canonicalJsonStringify(rebuiltMetadata[key])
      )
        : [];
      if (differingMetadataKeys.length > 0) {
        throw new Error(
          `PROJECT_REPRODUCTION_FAILED: deterministic metadata differs (${differingMetadataKeys.join(", ")}).`,
        );
      }

      const next = validated.settings;
      pendingOpenedFinalRef.current = { result: recomputed, completedAtUtc };
      pendingOpenedResultEditedRef.current = archivedResultEdited;
      pendingOpenedResultQualityRef.current = validated.resultQuality;
      applySettings(next, decoded);
      if (!profiles.some((profile) => profile.id === projectProfile.id)) {
        setProfiles((current) => [...current, projectProfile]);
      }
      setSelectedProfileId(projectProfile.id);
      setSelectedPresetId(projectProfile.presets[0]?.id ?? "default");
      setWorkspaceMode(validated.workspaceMode);
      setResultOrigin(validated.resultOrigin);
      workspaceModeRef.current = validated.workspaceMode;
      if (validated.tilemap !== undefined && verifiedTilemap !== null) {
        const tilemapSettings = validated.tilemap.settings;
        const projectCharset = tilemapSettings.source === "existing"
          ? validated.tilemap.sourceCharset
          : validated.tilemap.charset;
        const projectCharsetCount = projectCharset.length / 8;
        const projectRange = tilemapSettings.source === "existing" &&
            tilemapSettings.existingCharsetRange !== undefined
          ? clampCharsetRange(
              projectCharsetCount,
              tilemapSettings.existingCharsetRange.startIndex,
              tilemapSettings.existingCharsetRange.length,
            )
          : {
              startIndex: 0,
              length: projectCharsetCount,
            };
        setCharsetSource("existing");
        setCharsetTilesView(tilemapSettings.source === "existing" ? "source" : "output");
        setCharsetEncoding(
          projectRange.length > 32 ? "extended" : tilemapSettings.encoding,
        );
        setCharsetBudget(projectRange.length);
        setExistingCharsetStart(projectRange.startIndex);
        setExistingCharsetLength(projectRange.length);
        setExistingCharsetStartEntry(String(projectRange.startIndex + 1));
        setExistingCharsetLengthEntry(String(projectRange.length));
        const projectSelection =
          tilemapSettings.source === "existing" &&
              tilemapSettings.existingCharsetSelection !== undefined
            ? [...tilemapSettings.existingCharsetSelection.indices]
            : null;
        existingCharsetSelectionRef.current = projectSelection;
        setExistingCharsetSelection(projectSelection);
        const projectOutputSourceIndices = tilemapSettings.source === "existing"
          ? projectSelection ?? Array.from(
              { length: projectRange.length },
              (_, index) => projectRange.startIndex + index,
            )
          : Array.from({ length: verifiedTilemap.characterCount }, (_, index) => index);
        setEmittedSourceCharsetIndices(
          projectOutputSourceIndices.length === verifiedTilemap.characterCount
            ? projectOutputSourceIndices
            : null,
        );
        setCharsetSelectionMode(false);
        setSelectedSourceCharsetTile(null);
        setCharsetStrategy(tilemapSettings.derivedStrategy);
        setCharsetDistance(tilemapSettings.distanceMetric);
        setCharsetAllowTransforms(tilemapSettings.allowTransforms);
        setCharsetAllowPolarity(tilemapSettings.allowPolarity);
        setCharsetVisualWeighting(tilemapSettings.visualWeighting);
        setExistingCharset(projectCharset);
        setExistingCharsetName("project-charset.bin");
        setCharsetState({ kind: "ready", result: verifiedTilemap });
        initializeTileEditor(verifiedTilemap);
        setTilemapStale(false);
      } else {
        setCharsetState({ kind: "idle" });
      }
      setImage(workingDecoded);
      setOriginalImage({ ...decoded, rgba: decoded.rgba.slice() });
      setSourceFrameIndex(validated.sourceFrameIndex);
      if (validated.workingSourcePng !== undefined && !recoveredWorkingSource) {
        setBitmapEditorRevertSource({ ...decoded, rgba: decoded.rgba.slice() });
        bitmapEditorFullBufferRef.current = {
          width: workingDecoded.width,
          height: workingDecoded.height,
          rgba: workingDecoded.rgba.slice(),
        };
        setBitmapEditorBuffer(bitmapEditorFullBufferRef.current);
      }
      setSourceFileName(file.name);
      setProjectName(validated.projectName === "Untitled project"
        ? normalizeProjectName(sanitizeArtifactBaseName(file.name))
        : validated.projectName);
      setSourceArtifact({
        sha256: await sha256Hex(sourceBytes),
        baseName: sanitizeArtifactBaseName(file.name),
        bytes: sourceBytes,
      });
      setImageStatus(
        `Opened validated project · ${decoded.width} × ${decoded.height} source · ` +
        (validated.resultQuality === "Draft"
          ? `restored archived Quick result · ${recomputed.scr.length.toLocaleString()} bytes.`
          : `reproduced ${recomputed.scr.length.toLocaleString()}-byte High result.`) +
        (repairedLegacyCharsetSelection
          ? " Corrected legacy charset-selection mapping."
          : "") +
        (recoveredWorkingSource
          ? " Recovered using the original source; the invalid working-source edit was not preserved."
          : ""),
      );
      setExportError(null);
    } catch (error: unknown) {
      pendingOpenedFinalRef.current = null;
      setExportError(`Project open rejected: ${error instanceof Error ? error.message : "Validation failed."}`);
    } finally {
      verifier.dispose();
    }
  }
  const standaloneTilemapPreview = workspaceMode === "tilemap" &&
    charsetState.kind === "ready" && !tilemapStale && displayedResult === null;
  const bitmapEditorFlashFrame = displayedResult?.frames[
    Math.min(bitmapEditorResultFrameIndex, Math.max(0, displayedResult.frames.length - 1))
  ];
  const bitmapEditorFlashEncoded = bitmapEditorTarget === "result" &&
      displayedResult?.platformId === "zx-spectrum"
    ? bitmapEditorResultBuffer?.encoded ?? bitmapEditorFlashFrame?.encoded
    : undefined;
  const tilemapFlashScreen = workspaceMode === "tilemap" && charsetState.kind === "ready"
    ? charsetState.result.decodedScr
    : null;
  const flashPreviewAvailable = tilemapFlashScreen !== null
    ? zxScreenContainsFlash(tilemapFlashScreen)
    : workspaceMode === "palette" && displayedResult?.platformId === "zx-spectrum" &&
      displayedResult.frames.some((frame, index) => {
        const encoded = index === bitmapEditorResultFrameIndex && bitmapEditorFlashEncoded !== undefined
          ? bitmapEditorFlashEncoded
          : frame.encoded;
        return zxScreenContainsFlash(encoded);
      });
  useEffect(() => {
    if (bitmapEditorFlashPreviewMode === "inverted") {
      setBitmapEditorFlashPreviewPhase(true);
      return;
    }
    setBitmapEditorFlashPreviewPhase(false);
    if (bitmapEditorFlashPreviewMode !== "animate" || !flashPreviewAvailable) return;
    const timer = window.setInterval(() => {
      setBitmapEditorFlashPreviewPhase((phase) => !phase);
    }, 500);
    return () => window.clearInterval(timer);
  }, [
    bitmapEditorFlashPreviewMode,
    flashPreviewAvailable,
  ]);
  useEffect(() => {
    if (bitmapEditorTarget !== "result" || displayedResult === null || bitmapEditorResultEdited) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, displayedResult.frames.length - 1));
    const frame = displayedResult.frames[frameIndex];
    const current = bitmapEditorResultBufferRef.current;
    if (frame !== undefined &&
        (current === null || bitmapEditorResultSourceRef.current !== displayedResult || current.hardwareModeId !== frame.hardwareModeId)) {
      initializeResultEditor(displayedResult, frameIndex);
    }
  }, [displayedResult, bitmapEditorTarget, bitmapEditorResultEdited, bitmapEditorResultFrameIndex]);
  const displayedAttributeHeight = displayedResult?.attributeHeight ?? attributeHeight;
  // Paint after the preview subtree has been committed to its current host.
  // This is important when a bitmap editor moves through a portal: a passive
  // effect can leave the newly attached canvas blank until another content
  // selection causes a later render.
  useLayoutEffect(() => {
    const sourceCanvas = bitmapEditorSourceCanvasRef.current;
    const resultCanvas = bitmapEditorResultCanvasRef.current;
    const mergedFlashCanvas = bitmapEditorMergedFlashCanvasRef.current;
    const activeEditorBuffer = bitmapEditorTarget === "result"
      ? bitmapEditorResultBuffer
      : bitmapEditorBuffer;
    const target = activeEditorBuffer ?? (bitmapEditorTarget === "source"
      ? fullBitmapBufferFromSource()
      : (() => {
      if (displayedResult === null) return null;
      const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, displayedResult.frames.length - 1));
      const frame = displayedResult.frames[frameIndex];
      const input = resultFrameInput(displayedResult, frameIndex);
      const nativeBitmap = input === null ? null : createNativeResultBitmap(input);
      if (frame === undefined || nativeBitmap === null) return null;
      return {
        width: frame.nativeWidth,
        height: frame.nativeHeight,
        rgba: nativeBitmap.rgba,
        pixels: nativeBitmap.paletteIndices,
      };
    })());
    if (target === null || target === undefined) return;
    const editorFlashPhase = bitmapEditorFlashPreviewMode === "inverted" ||
      (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase);
    const activeZxResultEncoded = bitmapEditorTarget === "result" &&
        displayedResult?.platformId === "zx-spectrum"
      ? bitmapEditorResultBuffer?.encoded ?? displayedResult.frames[
          Math.min(bitmapEditorResultFrameIndex, Math.max(0, displayedResult.frames.length - 1))
        ]?.encoded
      : undefined;
    let renderedRgba = target.rgba;
    if (bitmapEditorTarget === "result") {
      const isZxWithAttributes = displayedResult?.platformId === "zx-spectrum" &&
        displayedResult.attributeHeight !== null && activeZxResultEncoded !== undefined;
      if (!bitmapEditorShowPixels && !bitmapEditorShowAttributes) {
        renderedRgba = new Uint8Array(target.width * target.height * 4);
      } else if (isZxWithAttributes && activeZxResultEncoded !== undefined) {
        if (!bitmapEditorShowPixels && bitmapEditorShowAttributes) {
          const attributesOnly = activeZxResultEncoded.slice();
          attributesOnly.fill(0, 0, ZX_BITMAP_BYTES);
          renderedRgba = renderZxFlashPreview(
            attributesOnly,
            displayedResult.attributeHeight!,
            editorFlashPhase,
            resolveZxPalette(zxPaletteDefinition),
          );
        } else if (bitmapEditorShowPixels && !bitmapEditorShowAttributes) {
          renderedRgba = zxBitmapToMonochromeRgba(activeZxResultEncoded);
        } else if (editorFlashPhase) {
          renderedRgba = renderZxFlashPreview(
            activeZxResultEncoded,
            displayedResult.attributeHeight!,
            true,
            resolveZxPalette(zxPaletteDefinition),
          );
        }
      } else if (!bitmapEditorShowPixels) {
        renderedRgba = new Uint8Array(target.width * target.height * 4);
      }
    }
    const selectionPointer = bitmapEditorSelectionPointerRef.current;
    const sourceSelection = selectionPointer?.action === "move"
      ? selectionPointer.selection
      : null;
    const destinationSelection = bitmapEditorSelectionDraft;
    if (bitmapEditorTarget === "result" && sourceSelection !== null && destinationSelection !== null) {
      const preview = renderedRgba.slice();
      const selectedPixels = new Uint8ClampedArray(sourceSelection.width * sourceSelection.height * 4);
      const selectionMemory = bitmapEditorClipboard !== null && bitmapEditorClipboard.width === sourceSelection.width && bitmapEditorClipboard.height === sourceSelection.height
        ? bitmapEditorClipboard
        : null;
      for (let y = 0; y < sourceSelection.height; y += 1) {
        for (let x = 0; x < sourceSelection.width; x += 1) {
          const maskIndex = y * sourceSelection.width + x;
          if (sourceSelection.mask[maskIndex] !== 1) continue;
          const sourceX = sourceSelection.x + x;
          const sourceY = sourceSelection.y + y;
          if (sourceX < 0 || sourceX >= target.width || sourceY < 0 || sourceY >= target.height) continue;
          const sourceOffset = (sourceY * target.width + sourceX) * 4;
          const selectionOffset = maskIndex * 4;
          const memoryOffset = maskIndex * 4;
          selectedPixels.set(selectionMemory === null
            ? renderedRgba.subarray(sourceOffset, sourceOffset + 4)
            : selectionMemory.rgba.subarray(memoryOffset, memoryOffset + 4), selectionOffset);
          preview.fill(0, sourceOffset, sourceOffset + 4);
        }
      }
      for (let y = 0; y < sourceSelection.height; y += 1) {
        for (let x = 0; x < sourceSelection.width; x += 1) {
          const maskIndex = y * sourceSelection.width + x;
          if (sourceSelection.mask[maskIndex] !== 1) continue;
          const destinationX = destinationSelection.x + x;
          const destinationY = destinationSelection.y + y;
          if (destinationX < 0 || destinationX >= target.width || destinationY < 0 || destinationY >= target.height) continue;
          const destinationOffset = (destinationY * target.width + destinationX) * 4;
          const selectionOffset = maskIndex * 4;
          preview.set(selectedPixels.subarray(selectionOffset, selectionOffset + 4), destinationOffset);
        }
      }
      renderedRgba = preview;
    }
    const pendingSelection = bitmapEditorRegionSelection;
    const pendingClipboard = bitmapEditorClipboard;
    if (bitmapEditorTarget === "result" && bitmapEditorPasteMode !== null && pendingSelection !== null &&
        pendingClipboard !== null && pendingClipboard.rgba.length === pendingClipboard.width * pendingClipboard.height * 4) {
      const preview = renderedRgba.slice();
      const eraseSelection = bitmapEditorPasteMode === "move" ? pendingClipboard.eraseSelection ?? pendingSelection : null;
      if (eraseSelection !== null) {
        for (let y = 0; y < eraseSelection.height; y += 1) {
          for (let x = 0; x < eraseSelection.width; x += 1) {
            if (eraseSelection.mask[y * eraseSelection.width + x] !== 1) continue;
            const pixelX = eraseSelection.x + x;
            const pixelY = eraseSelection.y + y;
            if (pixelX < 0 || pixelX >= target.width || pixelY < 0 || pixelY >= target.height) continue;
            const offset = (pixelY * target.width + pixelX) * 4;
            preview.fill(0, offset, offset + 4);
          }
        }
      }
      for (let y = 0; y < pendingClipboard.height; y += 1) {
        for (let x = 0; x < pendingClipboard.width; x += 1) {
          if (pendingClipboard.mask[y * pendingClipboard.width + x] !== 1) continue;
          const pixelX = pendingSelection.x + x;
          const pixelY = pendingSelection.y + y;
          if (pixelX < 0 || pixelX >= target.width || pixelY < 0 || pixelY >= target.height) continue;
          const destinationOffset = (pixelY * target.width + pixelX) * 4;
          const sourceOffset = (y * pendingClipboard.width + x) * 4;
          preview.set(pendingClipboard.rgba.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
        }
      }
      renderedRgba = preview;
    }
    const renderedTarget = { ...target, rgba: renderedRgba };
    for (const canvas of [sourceCanvas, resultCanvas]) {
      if (canvas === null) continue;
      canvas.width = renderedTarget.width;
      canvas.height = renderedTarget.height;
      const context = canvas.getContext("2d");
      if (context === null) continue;
      context.putImageData(
        new ImageData(new Uint8ClampedArray(renderedTarget.rgba), renderedTarget.width, renderedTarget.height),
        0,
        0,
      );
    }
    if (mergedFlashCanvas !== null &&
        bitmapEditorTarget === "result" &&
        displayedResult?.platformId === "zx-spectrum" &&
        displayedResult.modeId === "zx48-mixed-256x192" &&
        displayedResult.frames.length === 2 &&
        displayedResult.attributeHeight !== null) {
      const [firstFrame, secondFrame] = displayedResult.frames;
      if (firstFrame !== undefined && secondFrame !== undefined) {
        const firstPhase = renderZxFlashPreview(
          firstFrame.encoded,
          displayedResult.attributeHeight,
          editorFlashPhase,
          resolveZxPalette(zxPaletteDefinition),
        );
        const secondPhase = renderZxFlashPreview(
          secondFrame.encoded,
          displayedResult.attributeHeight,
          editorFlashPhase,
          resolveZxPalette(zxPaletteDefinition),
        );
        const merged = mergeTemporalRgba(firstPhase, secondPhase);
        mergedFlashCanvas.width = displayedResult.width;
        mergedFlashCanvas.height = displayedResult.height;
        const context = mergedFlashCanvas.getContext("2d");
        context?.putImageData(
          new ImageData(new Uint8ClampedArray(merged), displayedResult.width, displayedResult.height),
          0,
          0,
        );
      }
    }
  }, [
    bitmapEditorBuffer,
    bitmapEditorResultBuffer,
    bitmapEditorTarget,
    bitmapEditorFlashPreviewMode,
    bitmapEditorFlashPreviewPhase,
    bitmapEditorShowPixels,
    bitmapEditorShowAttributes,
    bitmapEditorRegionSelection,
    bitmapEditorSelectionDraft,
    bitmapEditorClipboard,
    bitmapEditorPasteMode,
    flashPreviewAvailable,
    displayedResult,
    zxPaletteDefinition,
    outputPreviewStage,
    sourcePreviewContent,
    resultPreviewContent,
    workbenchSourceFloating,
    workbenchResultFloating,
    workbenchPreviewLayer,
  ]);
  const benchmarkComparisonPreviews = useMemo(() => {
    if (benchmarkCompareDigests.length !== 2) return null;
    const first = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[0]);
    const second = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[1]);
    if (first === undefined || second === undefined ||
        first.result.width !== second.result.width ||
        first.result.height !== second.result.height) return null;
    const width = first.result.width;
    const height = first.result.height;
    return {
      first: rgbaPngDataUrl(first.result.mergedPreviewRgba, width, height),
      second: rgbaPngDataUrl(second.result.mergedPreviewRgba, width, height),
      difference: rgbaPngDataUrl(
        previewDifferenceHeatmap(
          first.result.mergedPreviewRgba,
          second.result.mergedPreviewRgba,
        ),
        width,
        height,
      ),
    };
  }, [benchmarkCompareDigests, benchmarkRows]);
  const inspectedFrameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
  const inspectedScr = displayedResult?.frames[inspectedFrameIndex]?.encoded ??
    displayedResult?.frames[0]?.encoded;
  const paletteUsage = displayedResult === null
    || displayedResult.platformId !== "zx-spectrum"
    || inspectedScr === undefined
    ? null
    : summarizePaletteUsage(
        inspectedScr,
        displayedResult.attributeHeight ?? attributeHeight,
      );
  const paletteUsageSlotTotal = paletteUsage === null
    ? 0
    : (paletteUsage.normalCells + paletteUsage.brightCells) * 2;
  const paletteUsagePercent = (count: number): string =>
    paletteUsageSlotTotal === 0
      ? "0.0%"
      : `${(count / paletteUsageSlotTotal * 100).toFixed(1)}%`;
  const visiblePaletteUsageColors = paletteUsage === null || paletteUsageFilter === "all"
    ? ZX_BASE_COLORS
    : ZX_BASE_COLORS.filter((color) =>
        (paletteUsage.normalColorCounts[color.code] ?? 0) > 0 ||
        (paletteUsage.brightColorCounts[color.code] ?? 0) > 0);
  const cropOverlay = cropSourceSize === null ||
    !cropValid || !cropSelectionActive
    ? null
    : {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
      };
  const borderHex = ZX_BASE_COLORS[borderColor]?.normal ?? "#000000";
  const paletteArtifactsReady = state.kind === "ready" && lastFinal !== null &&
    lastFinalCompletedAt !== null && sourceArtifact !== null;
  const editedPaletteProjectReady = workspaceMode === "palette" &&
    state.kind === "ready" && lastFinal !== null && sourceArtifact !== null &&
    bitmapEditorResultEdited;
  const draftProjectReady = workspaceMode === "palette" &&
    draftState.kind === "ready" && image !== null && sourceArtifact !== null;
  const tilemapArtifactsReady = charsetState.kind === "ready" && !tilemapStale &&
    (paletteArtifactsReady || specsciiDocumentName !== null);
  const artifactsReady = workspaceMode === "tilemap"
    ? tilemapArtifactsReady
    : paletteArtifactsReady || editedPaletteProjectReady || draftProjectReady;
  const resultSaveReady = state.kind === "ready" && lastFinal !== null && sourceArtifact !== null;
  const sourceCharsetCount = existingCharset === null ? 0 : Math.floor(existingCharset.length / 8);

  return {
    artifactsReady,
    benchmarkComparisonPreviews,
    borderHex,
    cropOverlay,
    displayedAttributeHeight,
    flashPreviewAvailable,
    openProject,
    paletteArtifactsReady,
    paletteUsage,
    paletteUsagePercent,
    resultSaveReady,
    sourceCharsetCount,
    standaloneTilemapPreview,
    tilemapArtifactsReady,
    visiblePaletteUsageColors,
  };
}
