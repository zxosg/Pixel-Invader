# Feature 005 — UI Typography Standardization: Implementation Plan

## Status

Implemented — verified with the focused typography/settings tests, the full
repository test suite, the web typecheck, and the production build.

## Scope and decisions

This feature standardizes the application UI typography to address the
inconsistency visible between workbench windows, controls, labels, and status
content. It adds user configuration without allowing arbitrary per-component
styling.

The planned model is:

- One curated, application-wide UI font-family selector.
- Separate size and weight settings for window titles, UI labels, and UI body
  text.
- Weight options are limited to `Normal` and `Bold`.
- Font sizes use bounded numeric controls and preserve the current appearance
  as the default.
- Settings are application-level and are applied only when the user saves.
- The Settings dialog shows a live sample using the unsaved draft values.
- Branding and large page headings remain separately styled.
- Monospace diagnostic/readout text keeps its monospace family but follows the
  configured body size and weight.
- Symbol/icon text keeps a symbol-compatible fallback family.

## Current implementation constraints

The main UI font stack is defined in `apps/web/src/styles.css` on `:root`.
There are already two partial tokens, `--ui-control-font-size` and
`--ui-label-font-size`, but many `font-size` and `font-weight` declarations
remain hardcoded.

The current Settings system is registry-driven:

- Definitions live in `apps/web/src/settings-registry.ts`.
- Application values live in `apps/web/src/application-settings.ts`.
- Draft validation and save canonicalization use
  `apps/web/src/settings-save.ts` and the Settings registry.
- The Settings dialog and live draft are rendered in `apps/web/src/App.tsx`.

Explicit font-family exceptions currently include:

- The root UI sans-serif stack.
- Unicode and symbol controls using `Arial Unicode MS` / `Segoe UI Symbol`.
- Status and diagnostic values using a monospace stack.

The implementation must avoid replacing these semantic exceptions with the
general UI family.

## Target settings model

Add an Appearance or Typography settings category to the registry. The
recommended settings are:

| Setting | Type | Scope | Purpose |
| --- | --- | --- | --- |
| UI font family | curated select | application | Selects the shared UI family token |
| Window title size | bounded number/slider | application | Size of dock/floating window titles and panel headers |
| Window title weight | Normal/Bold select | application | Thickness of window title text |
| UI label size | bounded number/slider | application | Size of field labels, headings, buttons, tabs, and control labels |
| UI label weight | Normal/Bold select | application | Thickness of UI labels |
| UI body size | bounded number/slider | application | Size of descriptions, help, status, and ordinary values |
| UI body weight | Normal/Bold select | application | Thickness of UI body text |

Store font family as a stable option ID rather than a raw CSS string. Map the
ID to a trusted fallback stack in code, for example:

```ts
type UiFontFamilyId = "inter" | "system" | "segoe";
```

The initial list should remain deliberately small and platform-safe. Do not
add font uploads or arbitrary CSS family entry as part of this feature.

Recommended initial size bounds are 10–24 px with a 1 px step. The exact
defaults must be measured from the current computed appearance before the
registry entries are finalized. The settings UI may display `px`, while CSS
custom properties receive the corresponding pixel values.

## Typography token architecture

Introduce semantic CSS custom properties at the application root:

```css
:root {
  --ui-font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  --ui-title-font-size: 12px;
  --ui-title-font-weight: 700;
  --ui-label-font-size: 11px;
  --ui-label-font-weight: 700;
  --ui-body-font-size: 12px;
  --ui-body-font-weight: 400;
}
```

The values should be generated from the saved application settings in
`App.tsx` or a small dedicated typography utility. Keep the CSS responsible
for presentation and the settings model responsible for validation and
persistence.

Create semantic selectors or utility classes for the three roles rather than
assigning typography by individual component name wherever possible:

- Window title role.
- UI label role.
- UI body role.

Controls such as `input`, `select`, `button`, and `textarea` should explicitly
use `font: inherit` where browser defaults currently interfere with the
configured typography.

## Delivery phases

### Phase 0 — Baseline and typography inventory

1. Record the current typecheck and test results.
2. Capture representative UI states at the current defaults:
   - Conversion workspace.
   - Palette workspace.
   - Dithering floating window.
   - Tilemap workspace.
   - Settings dialog.
3. Inventory every explicit `font-family`, `font-size`, and `font-weight`
   declaration in `apps/web/src/styles.css`.
4. Classify each declaration as:
   - Window title.
   - UI label.
   - UI body.
   - Branding/heading exception.
   - Monospace diagnostic exception.
   - Unicode/icon exception.
   - Layout-specific or intentionally decorative text.
5. Identify selectors that need special treatment at desktop, narrow, and
   floating-window breakpoints.

Exit criteria:

- Every typography declaration has a documented role or exception.
- The default token values reproduce the current visual hierarchy closely.

### Phase 1 — Extend application settings and registry

Primary files:

- `apps/web/src/application-settings.ts`
- `apps/web/src/application-settings.test.ts`
- `apps/web/src/settings-registry.ts`
- `apps/web/src/settings-registry.test.ts`
- `apps/web/src/settings-save.ts`
- `apps/web/src/settings-save.test.ts`

Tasks:

1. Add an `appearance` or `typography` setting category.
2. Add the global curated font-family setting.
3. Add size and Normal/Bold weight settings for the three roles.
4. Add defaults matching the current UI.
5. Add strict validation for family IDs, weights, and size bounds.
6. Add the settings to `ApplicationSettings` and its default value.
7. Include the new application fields in loading, canonical save, and
   `applicationSettingsValues`.
8. Keep loading backward-compatible when existing saved application settings
   do not contain typography fields.
9. Ensure invalid typography fields fall back individually to defaults rather
   than invalidating unrelated conversion settings.

Exit criteria:

- Existing application settings load unchanged.
- New settings round-trip through storage.
- Invalid family IDs, weights, and sizes are normalized safely.
- Registry filtering and category reset behavior include Typography.

### Phase 2 — Build the typography runtime layer

Recommended files:

- `apps/web/src/ui-typography.ts` or `apps/web/src/typography.ts`
- `apps/web/src/ui-typography.test.ts`
- `apps/web/src/App.tsx`

Tasks:

1. Map the family option ID to its trusted CSS fallback stack.
2. Map Normal/Bold to numeric CSS weights 400/700.
3. Convert validated settings into a CSS custom-property object.
4. Apply the custom properties to the workbench/application root.
5. Keep the draft typography values separate from the saved runtime values.
6. Define a small helper for applying typography to the Settings preview
   without mutating the saved runtime.

Exit criteria:

- The runtime can produce a complete, valid typography token set from either
  saved settings or a draft.
- No component needs to parse raw user strings into CSS.

### Phase 3 — Replace hardcoded UI typography

Primary file:

- `apps/web/src/styles.css`

Tasks:

1. Replace the root UI family with the resolved family token.
2. Replace workbench title-bar and promoted-window title declarations with the
   title tokens.
3. Replace field labels, section headings, button labels, tab labels, and
   control labels with label tokens.
4. Replace descriptions, help text, ordinary values, status messages, and
   body content with body tokens where safe.
5. Normalize `font: inherit` for native form controls and interactive
   elements.
6. Retain independent typography for:
   - Brand mark and page-level headings.
   - Monospace status/diagnostic/readout content.
   - Unicode/icon glyph controls.
   - Canvas/image content.
7. Remove obsolete size tokens only after all consumers have been migrated.
8. Check media-query overrides and floating/docked workbench selectors for
   declarations that accidentally bypass the semantic tokens.

Exit criteria:

- Same-purpose text uses the same role token across all workspaces.
- Changing a role token updates docked and floating windows consistently.
- Monospace and symbol exceptions remain visually and functionally correct.

### Phase 4 — Add Settings controls and live sample preview

Primary file:

- `apps/web/src/App.tsx`

Tasks:

1. Add typography controls through the existing registry-driven Settings
   dialog.
2. Group them under a clearly named Typography or Appearance category.
3. Use a curated family select, bounded size controls, and Normal/Bold
   selects.
4. Add a sample panel showing:
   - Window title sample.
   - UI label sample.
   - UI body sample.
   - Monospace diagnostic sample.
5. Apply draft values only to the sample panel while the dialog is open.
6. On Save, apply typography to the application root and persist it.
7. On Cancel, discard the draft and restore the prior sample/runtime state.
8. Make the Settings dialog itself use the saved runtime typography and use
   the draft typography only within the preview sample.
9. Ensure Reset Typography resets only typography values, not conversion or
   workspace settings.

Exit criteria:

- Users can preview a proposed configuration without changing the app.
- Save updates the full UI after the dialog closes.
- Cancel leaves the current UI unchanged.
- The settings dialog remains usable at the minimum and maximum values.

### Phase 5 — Accessibility and layout validation

Tasks:

1. Test minimum, default, and maximum sizes in every workspace.
2. Test Normal/Bold combinations for each role.
3. Test every curated family on the current operating system and browser.
4. Check title-bar controls, dock selectors, side rails, and compact toolbar
   rows for clipping or overflow.
5. Check that focus indicators and accessible labels remain visible.
6. Check that monospace diagnostics remain distinguishable from ordinary body
   text.
7. Test narrow layouts and floating windows separately.
8. Confirm browser-native form controls inherit the configured family and
   role size where intended.

Exit criteria:

- No required control or title is clipped at supported settings bounds.
- Text remains readable and keyboard-accessible.
- No typography setting changes conversion output or image/canvas content.

### Phase 6 — Regression and migration verification

Tasks:

1. Add tests for default application settings and legacy preference loading.
2. Add registry tests for category membership, defaults, and validation.
3. Add save tests for application typography fields.
4. Add runtime token tests for family mapping and Normal/Bold conversion.
5. Add UI tests for draft preview, Save, Cancel, and Reset Typography.
6. Run full typecheck, unit tests, and production build.
7. Review the final CSS for remaining unintended hardcoded UI typography.

## Acceptance criteria

- The UI has a consistent default font hierarchy across workspaces and
  promoted workbench windows.
- A curated UI font family can be selected in Settings.
- Window title, UI label, and UI body sizes can be configured independently.
- Each role supports Normal and Bold weight.
- Settings values are bounded, validated, persisted, and safely migrated.
- A live sample previews unsaved typography values.
- Save applies the new typography globally; Cancel does not.
- Settings itself uses the configured typography.
- Monospace diagnostics and symbol/icon text retain their intended families.
- Branding, large headings, canvas content, and browser chrome are not
  unintentionally changed.
- No conversion behavior or output data changes as a result of typography
  settings.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Missed hardcoded declarations | Maintain the Phase 0 inventory and audit with `rg` before completion |
| Larger text breaks compact workbench layouts | Use bounded controls and test all supported extremes |
| Font metrics differ between families | Use a curated list with explicit fallbacks and preview samples |
| Monospace or icon glyphs become unreadable | Keep semantic family exceptions and inherit only size/weight |
| Draft preview mutates live application state | Scope draft styles to the sample panel until Save |
| Older preferences fail to load | Add field-level defaults and migration tests |
| Synthetic bold differs by platform | Test the curated list and document platform fallback behavior |
