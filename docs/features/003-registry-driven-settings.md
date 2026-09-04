# Registry-Driven Settings Workspace

## Summary

Replace the fixed Settings modal with a scalable, searchable settings workspace. Settings are described by a typed registry and rendered by generic controls, so adding a new application or conversion option does not require another hand-built settings section.

The workspace remains responsible for editing and applying settings. Existing application-settings and workspace-preference storage remains compatible behind the new registry layer.

## Goals

- Make every supported configurable behavior discoverable from one Settings page.
- Support search, category filters, and curated filter presets.
- Keep application, conversion, project, and temporary editor state separate.
- Preserve Save, Cancel, Reset, validation, persistence, and immediate-apply behavior.
- Make dependencies and unsupported settings explicit instead of silently hiding controls.
- Keep the interface usable at the current desktop size and on narrow screens.

## Settings registry

Create a typed registry module containing metadata and behavior for each setting:

```ts
interface SettingDefinition<T> {
  id: string;
  category: SettingCategory;
  label: string;
  description: string;
  keywords?: readonly string[];
  presets?: readonly SettingPresetId[];
  scope: "application" | "conversion" | "project";
  control: SettingControl<T>;
  defaultValue: T;
  validate(value: unknown): T | null;
  isAvailable?(context: SettingsContext): boolean;
  isEnabled?(values: Readonly<Record<string, unknown>>, context: SettingsContext): boolean;
}
```

The registry should define, at minimum:

- Startup: profile, preset, hardware mode, framing.
- Workspace: layout, synchronize PAN, pane contents, zoom and grid preferences where appropriate.
- Mouse behavior: mouse-wheel zoom.
- Dithering: dithering mode, amount, ordered matrix, and related engine choices.
- Geometry: resampling, rotation, mirroring, crop and offsets.
- Image adjustments: brightness, contrast, saturation, gamma, smoothing, sharpening.
- Palette and attributes: palette selections, attribute dimensions, BRIGHT, FLASH, and halo controls.
- Editor: paint mode, color policies, and editor-specific behavior.

Each definition must specify its persistence scope. Temporary values such as undo history, active selection, inspection focus, and modal drafts must not be registered as persistent settings.

## Control types

Implement generic renderers for:

- Boolean checkbox.
- Select/combo box.
- Number input with min, max, and step.
- Slider with value readout.
- Text input.
- Color/palette selector.
- Read-only value.
- Action button for operations such as reset or migration.

Controls receive accessible labels, descriptions, validation messages, disabled explanations, and keyboard support from the registry metadata. Complex controls may provide a custom renderer while still using the common definition, scope, filtering, and validation contracts.

## Settings workspace UI

Replace the current modal body with:

```text
[ Search settings... ] [ Category ] [ Preset ] [ Modified only ]

Category
  Setting name        Description                 Current value/control
```

Use a semantic list or responsive two-column layout rather than a strict HTML table. A table-like dense desktop presentation is acceptable, but controls must remain readable and usable on narrow screens.

Requirements:

- Scroll only the settings content, not the application behind it.
- Keep the header, search/filter controls, and footer actions visible.
- Show category headings and result count.
- Show a modified marker when a draft differs from the saved/current value.
- Show an explicit empty state when no settings match.
- Preserve focus when filtering where possible.
- Support Escape to cancel and standard keyboard navigation.

The Settings button remains available before and after an image is loaded and must remain outside the conversion form.

## Search and filters

Search is case-insensitive and matches:

- Setting label.
- Description.
- Setting ID.
- Registered keywords.

Category filters include Startup, Workspace, Mouse behavior, Dithering, Geometry, Image adjustments, Palette and attributes, and Editor. The list must update without changing draft values.

Curated filter presets include at least:

- All settings.
- Startup.
- Workspace and mouse.
- Conversion quality.
- Palette and attributes.
- Editor.
- Modified settings.

Filter presets are views, not separate setting values. The selected filter may be stored as an unrelated UI preference, but it must not change application or project settings.

## Draft, validation, and dependencies

- Opening Settings snapshots all applicable current values into a draft.
- Editing the draft never changes live application state.
- Cancel discards the draft and leaves live and persisted values unchanged.
- Save validates the complete draft, applies accepted values using existing setters, and persists values by scope.
- Invalid values remain visible with an inline error and prevent Save until corrected.
- Reset to defaults requires confirmation and changes only the draft.
- Provide Reset category and Reset all behavior if the registry supports it.

Definitions may declare dependencies. Examples:

- Ordered matrix is enabled only when dithering mode is Ordered.
- Error-diffusion controls are enabled only for Error diffusion.
- Tilemap-only settings are unavailable in bitmap mode.
- Bitmap-editor settings are unavailable in tilemap mode.
- Hardware-specific settings are enabled only for compatible targets.

Disabled controls must include a concise reason. Unavailable settings may be hidden only when the user cannot act on them; otherwise display them disabled to explain the scope.

## Persistence and migration

Keep persistence separate by scope:

- Application settings use the versioned application-settings record.
- Workspace view preferences continue using the workspace-preferences record.
- Conversion and project values continue using their existing state/project serialization.

Add registry-driven serialization helpers that:

- Load known setting IDs only.
- Validate every value through its definition.
- Ignore unknown settings for forward compatibility.
- Preserve unrelated keys and existing preference records.
- Fall back to definition defaults when values are missing or invalid.
- Migrate the current fixed application-settings fields without changing binary formats.

Do not persist modal drafts, undo/redo history, active pane focus, tile selection, or inspection selection.

## Apply behavior

Use the existing profile, preset, hardware-mode, framing, workspace, PAN, and wheel-zoom setters. Save behavior must:

- Apply settings immediately.
- Mark conversion results stale when conversion-affecting values change.
- Avoid silently running Convert High.
- Retain the existing Draft/Convert High workflow.
- Update dependent controls and pane content after applying.
- Preserve current manual editor source and history unless the existing source/project lifecycle explicitly requires clearing them.

Changes to only search, category, filter preset, or modal layout must not trigger conversion or mark the project dirty.

## Implementation sequence

1. Add typed registry contracts, categories, control definitions, scopes, and validation helpers.
2. Register the existing Settings modal fields without changing behavior.
3. Add draft creation, generic value updates, validation, Save, Cancel, and Reset handling.
4. Replace the fixed modal body with the scrollable registry-driven settings list.
5. Add search, category filtering, curated filter presets, result count, and modified-only filtering.
6. Add dependency and availability evaluation with visible disabled explanations.
7. Connect registry persistence to application, workspace, conversion, and project scopes.
8. Add migration and safe fallback handling for existing preference records.
9. Add responsive styling, sticky header/footer, focus management, and keyboard behavior.
10. Remove duplicated hard-coded Settings UI once parity is verified.

## Tests and acceptance criteria

### Pure model tests

- Registry definitions have unique IDs and valid metadata.
- Every registered setting has a valid default.
- Search matches labels, descriptions, IDs, and keywords.
- Category and filter presets return the expected definitions.
- Modified-only filtering detects draft changes.
- Valid values round-trip through serialization.
- Invalid and unknown values fall back safely.
- Application, workspace, conversion, and project scopes remain separate.
- Dependency and availability rules produce the expected enabled state and explanation.
- Reset all and reset category affect only the draft.

### UI tests

- Settings opens before and after an image is loaded.
- Categories, search, filters, and presets are visible and functional.
- The settings content scrolls independently while header/footer remain available.
- Search preserves draft values.
- Cancel leaves live state and storage unchanged.
- Save applies values immediately and persists them.
- Reset requires confirmation and does not apply until Save.
- Dithering mode and amount appear in the registry-driven UI.
- Dependent controls enable and disable correctly.
- Unsupported bitmap/tilemap settings explain their disabled state.
- Keyboard navigation and Escape behavior work.
- No settings action accidentally submits the conversion form.

Run TypeScript validation, the full Vitest suite, production build, and browser verification with fresh startup, saved settings reload, invalid values, modal cancellation, filters, dependencies, and both bitmap and tilemap modes.

## Non-goals

- Changing conversion algorithms or hardware binary formats.
- Replacing project-file serialization with generic settings storage.
- Persisting temporary editor state or history.
- Automatically converting after every Settings save.

## Assumptions

- The registry is the source of truth for Settings presentation, metadata, validation, and filtering.
- Existing application and workspace preference keys remain supported.
- A setting’s scope determines where its value is persisted.
- Save is the only action that applies modal drafts.
- Existing conversion and editor behavior remains unchanged unless explicitly represented by a registered setting.
