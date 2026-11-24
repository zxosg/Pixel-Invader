import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useWorkbenchWindows } from "./use-workbench-windows.js";
import type { useWorkbenchLayout } from "./use-workbench-layout.js";
import type { useResultEditing } from "./use-result-editing.js";
import type { useConversionSettings } from "./use-conversion-settings.js";
import type { useConversionActions } from "./use-conversion-actions.js";
import type { usePreviewInspection } from "./use-preview-inspection.js";
import type { useEngineSettingsBenchmarks } from "./use-engine-settings-benchmarks.js";
import type { useEditorOperations } from "./use-editor-operations.js";
import type { useBitmapEditorTools } from "./use-bitmap-editor-tools.js";
import type { useBitmapEditorPointer } from "./use-bitmap-editor-pointer.js";
import type { useCharsetAndExport } from "./use-charset-and-export.js";
import type { useProjectAndArtifacts } from "./use-project-and-artifacts.js";
import type { usePreviewSizing } from "./use-preview-sizing.js";
import type { usePreviewLabels } from "./use-preview-labels.js";

export type AppState = ReturnType<typeof useRuntimeState> &
  ReturnType<typeof useSettingsState> &
  ReturnType<typeof useWorkbenchState> &
  ReturnType<typeof useWorkbenchWindows> &
  ReturnType<typeof useWorkbenchLayout> &
  ReturnType<typeof useResultEditing> &
  ReturnType<typeof useConversionSettings> &
  ReturnType<typeof useConversionActions> &
  ReturnType<typeof usePreviewInspection> &
  ReturnType<typeof useEngineSettingsBenchmarks> &
  ReturnType<typeof useEditorOperations> &
  ReturnType<typeof useBitmapEditorTools> &
  ReturnType<typeof useBitmapEditorPointer> &
  ReturnType<typeof useCharsetAndExport> &
  ReturnType<typeof useProjectAndArtifacts> &
  ReturnType<typeof usePreviewSizing> &
  ReturnType<typeof usePreviewLabels>;
