# Feature 007 — Classic Workbench Menu Bar

## Status

Proposed — menu map and implementation direction; no UI implementation in this document.

## Summary

Add a conventional application menu bar above the existing conversion workbench. Move document actions, conversion context selectors, application settings, and panel/workspace commands into menus. Keep the preview and tools as the existing dockable/floating workbench windows.

The menu bar is an action surface, not another workbench window. It does not own conversion state, panel layout, or a dock assignment.

## Code structure and design fit

- `apps/web/src/App.tsx` owns the workbench React state, action handlers, import/export readiness, and the current rendering. It is the source of truth for menu state and callbacks.
- `apps/web/src/workbench-preferences.ts` owns panel layout, open/minimized state, and dock assignments for Tools, Geometry, Image adjustments, Palette, Dithering, Tilemap, Source preview, and Result preview.
- `apps/web/src/workspace-preferences.ts` owns the active workspace preset, preview content, zoom, grids, and inspection preferences.
- `apps/web/src/saved-workbench-layouts.ts` persists named combinations of workspace and workbench preferences.
- `apps/web/src/projects.ts` owns `.rccproject` validation and serialization.
- `apps/web/src/application-settings.ts` owns persisted application defaults. The existing Settings dialog in `App.tsx` edits these defaults and conversion settings.

Several command handlers are already usable: `importImage`, `importPmd85`, `openProject`, the export functions, `exportProject`, `openApplicationSettings`, `switchWorkspaceConversionMode`, `selectProfile`, `selectPreset`, `switchTargetMode`, `convertImage`, `cancelHigh`, `setWorkbenchWindowOpen`, `applyWorkspaceLayout`, `saveCurrentWorkbenchLayout`, and `selectSavedWorkbenchLayout`. The menu should call these handlers or the same small wrappers used by the current controls. It should not duplicate their validation, dirty-work confirmation, output generation, or persistence logic.

## Proposed placement and behavior

Render a compact menu bar as a sibling immediately before the `.workbench-workspace` section inside the application shell. This puts it above the workbench while keeping it outside `workbenchRootRef` and the dock surface. The existing workbench heading, preview area, title bars, drag/resize behavior, and left/right/bottom/floating dock geometry remain in place.

Move the profile, preset, conversion mode, and hardware mode selectors out of the conversion form and into the **Convert** menu. Keep the current selection visible in a small context summary near the Convert command (for example, `Palette · ZX Spectrum · Standard 256×192 · Default`). Do not make these selectors panels or windows. The main Convert High action can remain in the form as the prominent action and also be available from the menu for keyboard access.

Use a declarative command map to describe labels, command IDs, visibility, enabled state, checked/radio state, and keyboard shortcuts. Keep callback resolution in `App.tsx`, where the relevant state and existing handlers live. The first implementation can define the command map alongside the menu component; extracting all workbench state from `App.tsx` is not a prerequisite.

## Menu map

### File

| Item | Behavior / command | Availability |
| --- | --- | --- |
| Open Image… | Invoke `importImage(file)` | Always; retain dirty-work replacement confirmation |
| Open PMD Binary… | Invoke `importPmd85(file)` | PMD 85 profile/platform only |
| Open Project… | Invoke `openProject(file)` | Always; retain dirty-work replacement confirmation |
| Import Profile… | Invoke `importProfile(file)` | Always; retain profile validation and storage behavior |
| Save Project | Invoke `exportProject()` and download `.rccproject` | Current completed result and source are available; reuse the existing project-save readiness predicate |
| Export → PNG Preview | `exportPreviewPng()` | Current exportable completed result |
| Export → Animated GIF | `exportAnimatedFlashGif()` | Current result; require current Tilemap result in Tilemap mode |
| Export → Hardware Binary | `exportScr()` | Current exportable completed result; label may clarify `.scr`, `.bin`, or multiple screens from the active target |
| Export → Metadata JSON | `exportMetadata()` | Current completed result with metadata inputs |
| Export → Inspection JSON | `exportInspectionReport()` | ZX Spectrum completed result |
| Export → Raw Tilemap | `exportCharsetArtifact()` | Tilemap mode with current Tilemap artifact |
| Export → Final Charset | `exportFinalCharset()` | Tilemap mode with current Tilemap artifact |
| Export → Palette Source `.scr` | `exportScr()` | Tilemap mode with current palette source |
| Export → Decoder Preview PNG | `exportCharsetPreview()` | Tilemap mode with current Tilemap artifact |
| Export → Tilemap Diagnostics JSON | `exportCharsetDiagnostics()` | Tilemap mode with current Tilemap artifact |

Keep the export submenu context-sensitive: show the palette result formats in Palette mode and the Tilemap artifact formats in Tilemap mode. Metadata and inspection items should follow the same readiness and platform rules as their current controls. Do not add New, Close Project, Save Source, or Recent Files until the application has explicit semantics and handlers for them.

### Convert

| Item | Behavior / command | Availability |
| --- | --- | --- |
| Conversion Mode → Palette Conversion | Select `workspaceMode = "palette"` through `switchWorkspaceConversionMode` | Always; radio item |
| Conversion Mode → Tilemap Conversion | Select `workspaceMode = "tilemap"` | ZX Spectrum only; radio item |
| Profile → [profile name] | `selectProfile(profile.id)` | Filter to platform/profile choices compatible with current conversion mode; radio item |
| Preset → [preset name] | `selectPreset(preset.id)` | Presets for current profile; radio item |
| Hardware Mode → [supported mode] | `switchTargetMode(modeId)` | Modes supported by current profile/platform; radio item |
| Convert High | `convertImage()` | Source image loaded, settings valid, and no High conversion running |
| Cancel High | `cancelHigh()` | High conversion running |

The profile and mode submenus must be generated from the same current profile and mode catalog used by the existing selectors. Tilemap mode should continue to constrain the profile list to ZX Spectrum. A profile change should keep the existing preset-selection behavior; choosing a hardware mode should keep the existing target-retargeting and compatibility behavior.

### View

| Item | Behavior / command | Availability |
| --- | --- | --- |
| Workbench Panels → Tools | Show/restore or hide the Tools window | Always |
| Workbench Panels → Geometry | Show/restore or hide Geometry | Always |
| Workbench Panels → Image Adjustments | Show/restore or hide Image adjustments | Always |
| Workbench Panels → Palette Controls | Show/restore or hide Palette controls | Always |
| Workbench Panels → Dithering Controls | Show/restore or hide Dithering controls | Always |
| Workbench Panels → Tilemap Controls | Show/restore or hide Tilemap controls | Tilemap mode only |
| Workbench Panels → Source Preview | Show/restore or hide Source preview | Always |
| Workbench Panels → Result Preview | Show/restore or hide Result preview | Always |
| Workspace Layout → Conversion / Palette Tuning / Dithering Review / Tilemap Cleanup / Editor / Pixel Inspection | `applyWorkspaceLayout(layout)` | Tilemap Cleanup only in Tilemap mode; Editor only in Palette mode; radio item reflects selected layout |
| Workspace Layout → [saved layout] | `selectSavedWorkbenchLayout(id)` | One item per saved layout; radio item reflects selected layout |
| Save Current Layout… | Enter a name and call `saveCurrentWorkbenchLayout()` | Always; preserve the existing 40-character name limit and update behavior |
| Delete Selected Layout | `deleteSavedWorkbenchLayout(id)` | A saved layout is selected |
| Reset Workspace Arrangement | `resetWorkspaceArrangement()` | Always |

Panel items should show a check when their window is open. Selecting a closed item should reveal it; selecting a minimized item should restore it; selecting an expanded item can hide it by updating its existing `open` state. The menu must not rewrite its dock assignment or position. `setWorkbenchWindowOpen` changes only `open`, so add a small show/restore wrapper that also clears `minimized` when the user invokes a hidden or minimized panel command.

Workspace presets and named workbench layouts remain distinct concepts: the former apply built-in view arrangements, while named layouts restore both workspace and dock/window preferences.

### Settings

| Item | Behavior / command | Availability |
| --- | --- | --- |
| Application Settings… | `openApplicationSettings()` | Always; opens the current Settings dialog |

The existing Settings dialog remains the editor for advanced conversion parameters, display preferences, typography, and persisted defaults. Profile, preset, conversion mode, and hardware mode selection belong in Convert because they are active per-workspace choices rather than another panel window.

### Help

Do not add a Help menu in the first pass. The current app has no help/about action handler or destination to connect to. Add it when there is a concrete help, documentation, or about surface.

## Command and UI implementation notes

- Extract a small `WorkbenchMenuBar` component that receives a typed command model and callbacks. Keep authoritative app state and existing action handlers in `App.tsx` initially.
- Use hidden file inputs or refs to the existing inputs for Open and Import Profile commands; each menu item should invoke the same native file picker path and `File` handler.
- Derive enabled state from the same values currently used by form/footer controls (`isPmd`, `isZx`, `settingsValid`, conversion state, `artifactsReady`, and `resultSaveReady`). Avoid parallel readiness rules.
- Keep asynchronous export failures in the existing `exportError` status area; the menu closes after dispatch and must not swallow errors.
- Retain dirty-work confirmation in existing open handlers. Menu commands should not bypass or duplicate it.
- Use radio semantics for mutually exclusive mode, profile, preset, hardware mode, and layout choices; use checked menu items for panel open state.
- Support keyboard access: menu buttons respond to Enter/Space, arrow keys move among items, Escape closes the open menu, and focus returns to the trigger after dismissal. Show available shortcuts beside commands; implement them in the same command dispatcher and ignore shortcuts while the user is editing text or a form field.
- Keep each menu short at the first level. Place the many export formats, panels, and layouts in submenus rather than turning the bar into a toolbar.
- Preserve responsive behavior: menus should remain operable on narrow screens, using wrapping or a compact overflow menu without covering dock controls or making the workbench narrower than its existing minimum.

## Suggested first-pass command IDs

```ts
type WorkbenchCommandId =
  | "file.open-image"
  | "file.open-pmd85"
  | "file.open-project"
  | "file.import-profile"
  | "file.save-project"
  | "export.preview-png"
  | "export.animated-gif"
  | "export.hardware-binary"
  | "export.metadata"
  | "export.inspection"
  | "export.tilemap"
  | "export.charset"
  | "export.palette-source"
  | "export.tilemap-preview"
  | "export.tilemap-diagnostics"
  | "convert.mode.palette"
  | "convert.mode.tilemap"
  | "convert.profile"
  | "convert.preset"
  | "convert.hardware-mode"
  | "convert.run-high"
  | "convert.cancel-high"
  | "view.panel"
  | "view.workspace-layout"
  | "view.saved-layout"
  | "view.save-layout"
  | "view.delete-layout"
  | "view.reset-arrangement"
  | "settings.open";
```

Dynamic IDs for profile, preset, hardware mode, panel, and layout instances may carry an entity ID in the menu item model rather than expanding this union. The command model should be presentation data only; command execution remains in the application layer.

## Acceptance criteria for implementation

- The menu bar is visible above the workbench and does not participate in dock placement, floating-window coordinates, or panel persistence.
- Existing panels remain dockable, floating, resizable, minimizable, and position-persistent after menu actions are added.
- Open Image, Open Project, Save Project, and each applicable export produce the same results and confirmations as the current controls.
- Conversion mode, profile, preset, and hardware mode can be changed from the Convert menu and display the active selection.
- The View menu can reopen any hidden panel and restore minimized panels without changing their saved dock or position.
- Built-in and saved workspace layouts remain available and retain their current persistence behavior.
- Application Settings opens the current Settings dialog.
- Menu items expose correct dynamic visibility, enablement, selected state, accessible names, and keyboard operation.
- Existing footer and selectors can be removed only after their actions are represented in the menu and the primary Convert High button remains easy to find.
