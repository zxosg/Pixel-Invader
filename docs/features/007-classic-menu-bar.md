# Feature 007 — Classic Workbench Menu Bar

## Status

Implemented — classic menus are rendered above the dockable workbench and call the existing application actions.

## Summary

Add a conventional application menu bar above the existing conversion workbench. Move document actions, conversion context selectors, application settings, and panel/workspace commands into menus. Keep the preview and tools as the existing dockable/floating workbench windows.

The menu bar is an action surface, not another workbench window. It does not own conversion state, panel layout, or a dock assignment.

## Code structure and design fit

- `apps/web/src/App.tsx` owns the workbench React state, action handlers, import/export readiness, and the current rendering. It is the source of truth for menu state and callbacks.
- `apps/web/src/workbench-preferences.ts` owns panel visibility, disclosure/minimized state, and dock assignments for Tools, Geometry, Image adjustments, Palette, Dithering, Tilemap, Source preview, and Result preview.
- `apps/web/src/workspace-preferences.ts` owns the active workspace preset, preview content, zoom, grids, and inspection preferences.
- `apps/web/src/saved-workbench-layouts.ts` persists named combinations of workspace and workbench preferences.
- `apps/web/src/projects.ts` owns `.rccproject` validation and serialization.
- `apps/web/src/application-settings.ts` owns persisted application defaults. The existing Settings dialog in `App.tsx` edits these defaults and conversion settings.

Several command handlers are already usable: `importImage`, `importPmd85`, `openProject`, the export functions, `exportProject`, `openApplicationSettings`, `switchWorkspaceConversionMode`, `selectProfile`, `selectPreset`, `switchTargetMode`, `convertImage`, `cancelHigh`, and `setWorkbenchWindowVisibility`. Workspace profile selection, snapshot application, dirty tracking, and persistence should be handled by a single small application-layer API rather than duplicated in menu presentation code.

## Proposed placement and behavior

Render a compact menu bar as a sibling immediately before the `.workbench-workspace` section inside the application shell. This puts it above the workbench while keeping it outside `workbenchRootRef` and the dock surface. The existing workbench heading, preview area, title bars, drag/resize behavior, and left/right/bottom/floating dock geometry remain in place.

Move the profile, preset, conversion mode, and hardware mode selectors out of the conversion form and into the **Convert** menu. Keep the current selection visible in a small context summary near the Convert command (for example, `Palette · ZX Spectrum · Standard 256×192 · Default`). Do not make these selectors panels or windows. The main Convert High action remains in the form as the prominent action and is also available from the menu for keyboard access.

Implement `WorkbenchMenuBar` as a small component with typed state and callbacks. Keep authoritative app state and existing handlers in `App.tsx`; the menu component owns only its open menu, keyboard focus, and temporary layout-name input.

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
| Workspace Profiles → [default or saved profile] | `selectWorkspaceProfile(id)` | Radio selection tracks profile identity, not its underlying layout preset; selecting the active profile reapplies it |
| Save Changes | `saveWorkspaceProfileChanges()` | Enabled when the active profile differs from its last saved snapshot; updates saved and default profiles in place |
| Save as New Profile… | Enter a name and call `saveWorkspaceProfileAs(name)` | Preserve the 40-character name limit; reject duplicate names rather than silently overwriting |
| Rename / Delete Profile | `renameWorkspaceProfile(id, name)` / `deleteWorkspaceProfile(id)` | Defaults can be renamed or removed; removed defaults can be restored |
| Restore Default Profiles | `restoreDefaultWorkspaceProfiles()` | Restores deleted defaults and discards their edits while keeping custom profiles |
| Reapply Profile | `selectWorkspaceProfile(activeId)` | Reloads the current profile even when it is already selected |
| Reset Workspace Arrangement | `resetWorkspaceArrangement()` | Always |

Default and user-saved workspace profiles share one profile list and selection model. Each profile captures the conversion workspace and the complete dock/window arrangement. Default profiles can be edited, renamed, and removed; **Restore Default Profiles** restores the original defaults. The active profile remains selected while it is edited and shows an unsaved-change state until saved or reapplied. Preset application must set every window's dock/floating state from the profile so a window cannot retain floating state from the previous arrangement.

### Window

Each applicable workbench window appears as a checkbox item, labelled with its name. Its checked state maps only to the persisted `visible` field. Toggling it leaves its disclosure state, minimized state, dock assignment, and geometry unchanged. A hidden window is removed from the desktop layout and can only be shown again through this menu. Minimized, collapsed, and tiled windows remain distinct states.

Palette and Dithering appear in Palette mode; Tilemap appears in Tilemap mode. Tools, Geometry, Image adjustments, Source preview, and Result preview are available in either mode. Keep the menu open after toggling an item so multiple windows can be changed in one pass.

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
- Use radio semantics for mutually exclusive mode, profile, preset, hardware mode, and layout choices; use checkbox menu items for panel visibility.
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
- The Window menu hides and restores each listed workbench window without changing its minimized state, disclosure state, dock, or geometry. Hidden windows consume no desktop layout space.
- Default and saved workspace profiles share one selection model; selecting a saved profile never marks a default with the same layout category as selected.
- Reapplying the selected profile is a direct action and does not require changing the selection to a placeholder first.
- Save Changes updates the active profile when its captured arrangement is modified; Save as New creates a separate profile.
- Default profiles can be renamed, edited, and deleted. Restore Default Profiles reinstates deleted profiles and original default configurations.
- Applying any profile fully resets or restores every window's floating and docked state.
- Application Settings opens the current Settings dialog.
- Menu items expose correct dynamic visibility, enablement, selected state, accessible names, and keyboard operation.
- Existing footer and selectors can be removed only after their actions are represented in the menu and the primary Convert High button remains easy to find.
