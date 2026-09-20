# Feature 004 — Dockable Workbench Windows: Implementation Plan

## Status

Planned — implementation not started.

## Source specification

See [Feature 004 — Dockable Workbench Windows](004-dockable-workbench-windows.md).

This plan intentionally excludes a top dock. The supported destinations are
left, right, bottom, and floating.

## Implementation strategy

Refactor the current host-oriented workbench into a registry-driven window
system in two layers:

1. A shared layout/state layer owns dock assignment, minimized state, sizing,
   positions, ordering, persistence, and pointer/keyboard interactions.
2. A reusable window shell renders the title bar and layout actions around the
   existing Geometry, Adjustments, Palette, Dithering, Tilemap, Tools, Source,
   and Result content.

Conversion controls and preview logic should be moved into the shell without
changing their domain state or conversion behavior.

## Current implementation constraints

The current workbench has many independent React state variables in
`apps/web/src/App.tsx`, but only one aggregate settings dock/minimized state.
The settings sections are rendered inside `.workbench-settings-window`, while
floating preview panes already use a workbench-level portal. The plan should
remove that asymmetry rather than add more host-specific exceptions.

The current persisted preferences in
`apps/web/src/workbench-preferences.ts` also contain legacy fields such as
`settings`, `toolsDock`, `geometryFloating`, and `sourceDockedWidth`. They must
be migrated deliberately instead of being silently reinterpreted.

## Target architecture

### Window registry

Define one canonical list of active windows:

```ts
type WorkbenchWindowId =
  | "geometry"
  | "adjustments"
  | "palette"
  | "dithering"
  | "tilemap"
  | "tools"
  | "source"
  | "result";
```

`settings` is not an active window ID after migration. It may remain only as a
legacy migration token.

The registry should provide, per window:

- Display title or title resolver.
- Availability predicate, especially for Tilemap.
- Default dock and default dimensions.
- Minimum and maximum dock/floating sizes.
- Whether body disclosure state is meaningful.
- Content renderer or renderer key.

Keep the registry data separate from conversion state. A window ID must not be
used as a second source of truth for conversion settings.

### Layout state

Replace the current collection of window-specific floating booleans and host
state with a normalized layout object, for example:

```ts
interface WorkbenchWindowLayout {
  dock: "left" | "right" | "bottom" | "floating";
  minimized: boolean;
  open: boolean;
  dockSize?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  autoHeight?: boolean;
}

interface WorkbenchLayoutState {
  version: number;
  windows: Record<WorkbenchWindowId, WorkbenchWindowLayout>;
  order: readonly WorkbenchWindowId[];
}
```

Use shared dock sizes for the left, right, and bottom strips unless product
testing shows a need for per-window dock sizes. Window-specific floating width
and height remain independent.

### Rendering structure

The workbench root should have explicit regions:

```text
workbench root
├── heading / fixed main controls
├── side-left dock
├── center workspace
├── side-right dock
├── bottom dock
└── floating layer
```

Docked windows should be rendered as siblings in their region. Floating
windows may be rendered through the existing workbench-level portal/layer.
The removed settings host must not remain as a coordinate system for floating
children.

## Delivery phases

### Phase 0 — Baseline and safety checks

1. Confirm the working tree is clean before implementation.
2. Record the current typecheck and test results.
3. Add or update a small layout test fixture that represents the current
   preference shape, including floating Geometry, Palette, Source, and Result.
4. Define the preference migration version and the legacy-to-new window ID
   mapping.

Exit criteria:

- The baseline test command is known and passing.
- Migration examples are captured in tests before the old model is removed.

### Phase 1 — Introduce the normalized layout model

Primary files:

- `apps/web/src/workbench-preferences.ts`
- `apps/web/src/workbench-preferences.test.ts`
- `apps/web/src/saved-workbench-layouts.ts`
- `apps/web/src/saved-workbench-layouts.test.ts`

Tasks:

1. Replace the active `WorkbenchDock` union with left/right/bottom/floating.
2. Remove `settings` from the active window registry while accepting it during
   migration.
3. Add per-window minimized/open/dock state and shared dock dimensions.
4. Preserve floating positions, dimensions, auto-height, and window order.
5. Version the serialized workbench preference payload.
6. Migrate the existing settings host state to the promoted child windows.
7. Migrate legacy Tools and preview fields into the normalized structure.
8. Ensure invalid values fall back to valid defaults without touching
   conversion preferences.
9. Update saved-layout validation to accept and round-trip the new shape.

Migration policy:

- If a child already has an explicit floating position or size, retain it.
- Otherwise, inherit the old settings host dock and minimized state.
- Convert the old section disclosure flags to each child's `open` state.
- Remove `settings` from the active order and preserve the relative order of
  the promoted children.
- Preserve Source/Result preview split preferences where they still apply.

Exit criteria:

- New preferences round-trip all eight active windows.
- Existing v1 preferences load into the normalized model.
- Duplicate, unknown, missing, and out-of-range window entries are rejected
  or safely defaulted.

### Phase 2 — Build the reusable window shell

Primary files:

- New component file, recommended: `apps/web/src/workbench-window.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/App.tsx`

Tasks:

1. Create a shared shell with semantic window container, title, body, and
   actions.
2. Add dock-left, dock-right, dock-bottom, float, minimize, and restore
   actions.
3. Ensure each action stops disclosure/default behavior when nested in an
   existing control.
4. Add focus and pointer handlers that update floating z-order.
5. Add a generic resize-handle API for dock and floating modes.
6. Move keyboard resize behavior into the shared shell.
7. Keep titles and accessible names content-specific.
8. Preserve the existing visual language and compact controls.

The shell should not know about conversion settings. It should receive layout
state and callbacks from the layout layer.

Exit criteria:

- A test/demo window can switch among all four supported modes.
- Minimize/restore preserves layout state.
- Pointer and keyboard resize behavior is shared rather than duplicated.

### Phase 3 — Replace the settings host

Primary file:

- `apps/web/src/App.tsx`

Tasks:

1. Extract Geometry content from the settings host into the shared shell.
2. Extract Image adjustments content.
3. Extract Palette content.
4. Extract Dithering content.
5. Extract Tilemap content.
6. Delete the `.workbench-settings-window` host and its empty-dock/origin
   calculations.
7. Replace section-specific `workbench*Floating` booleans with layout lookups.
8. Preserve existing control IDs, labels, validation, and conversion event
   handlers.
9. Preserve section open/closed state independently from minimized state.
10. Keep Tilemap unavailable when the workspace is not in Tilemap mode.

Exit criteria:

- No promoted settings panel is a descendant of the Conversion settings host.
- The string/title `Conversion settings` is no longer used as a visible
  window title.
- Existing conversion controls behave identically when opened and changed.

### Phase 4 — Implement dock regions and non-overlap

Primary files:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

Tasks:

1. Add explicit left, center, right, bottom, and floating render regions.
2. Place all left/right windows in the side regions.
3. Place all bottom windows in a full-width bottom region.
4. Make side regions span only the vertical area above the bottom dock.
5. Remove absolute fixed `top`/`bottom` offsets used for docked Tools.
6. Define deterministic ordering for multiple windows on the same edge.
7. Ensure minimized windows keep their title bars without reserving content
   space.
8. Keep floating windows outside dock clipping contexts.
9. Retain the existing source/result preview split only for the shared center
   region; do not use it as a substitute for general docking.

Exit criteria:

- Side docks never cover the bottom dock or the workbench heading.
- Bottom docks span the workbench content width.
- Multiple windows on one edge are ordered and usable.
- Floating windows can overlap only as floating windows, not because of dock
  layout errors.

### Phase 5 — Generalize resizing and movement

Primary files:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- New utility/test file if useful, recommended:
  `apps/web/src/workbench-layout.ts`

Tasks:

1. Convert the existing settings resize logic to shared dock-region resize
   logic.
2. Add a real resize boundary for bottom-docked windows.
3. Add left/right boundaries for side docks.
4. Remove the special-case preview-docked resize path where it conflicts with
   the shared layout model.
5. Keep floating width and height resizing independent.
6. Clamp dimensions to content-specific minimums and maximums.
7. Clamp floating positions after viewport/workbench resize.
8. Ensure pointer cleanup runs on pointer-up, pointer-cancel, and unmount.
9. Make all resize handles keyboard reachable with correct ARIA values.
10. Decide whether a floating corner handle needs separate width and height
    semantics; implement separate handles if one separator cannot describe
    both axes accurately.

Exit criteria:

- Tools and every promoted settings window can resize when docked.
- Floating windows resize without changing their position unexpectedly.
- A minimized window has no active body resize handle.
- Resize state does not leak after cancellation or component teardown.

### Phase 6 — Move Tools and previews onto the shared model

Primary file:

- `apps/web/src/App.tsx`

Tasks:

1. Adapt Tools to the shared shell and normalized layout state.
2. Preserve Tools’ control behavior and open/closed body state.
3. Adapt Source preview and Result preview to the shared shell.
4. Preserve preview content selectors, zoom controls, pan behavior, and
   inspection focus.
5. Preserve floating preview portals where they are still useful, but source
   and result must use the same layout state as every other window.
6. Keep source/result content state separate from dock/minimized state.

Exit criteria:

- All eight active windows use the same layout model.
- Source and Result preview behavior is unchanged apart from placement and
  title-bar controls.
- Tools no longer uses a private dock selector implementation.

### Phase 7 — Persistence and workspace integration

Primary files:

- `apps/web/src/App.tsx`
- `apps/web/src/workbench-preferences.ts`
- `apps/web/src/saved-workbench-layouts.ts`

Tasks:

1. Replace the large save effect with serialization of normalized layout
   state.
2. Replace reset/restore code with default/layout assignment.
3. Update workspace presets to save and restore the normalized window model.
4. Ensure applying a workspace preset does not mutate conversion settings
   unless explicitly designed to do so.
5. Keep old saved workspace records loadable through migration.
6. Preserve current startup layout behavior where it remains compatible.

Exit criteria:

- Reload restores every window’s dock, minimized state, size, position, and
  order.
- Saved workspace layouts round-trip the full arrangement.
- Reset layout restores valid defaults for all windows.

### Phase 8 — Responsive and accessibility hardening

Primary files:

- `apps/web/src/styles.css`
- `apps/web/src/App.tsx`

Tasks:

1. Define the narrow-layout fallback for widths below the desktop threshold.
2. Prevent horizontal page overflow from dock controls or floating windows.
3. Verify title-bar and dock-action focus order.
4. Verify keyboard access to minimize, restore, dock actions, and resize.
5. Verify active dock state is understandable without color alone.
6. Ensure hidden bodies are not keyboard reachable when minimized.
7. Ensure floating z-order changes are not announced as unexpected focus
   movement.
8. Check that resize separators expose the correct orientation and values.

Exit criteria:

- The workbench is usable at desktop and narrow supported widths.
- Keyboard-only users can operate every window action.
- Screen-reader labels identify the window and the action being performed.

### Phase 9 — Verification and cleanup

Tasks:

1. Run typechecking.
2. Run the full Vitest suite.
3. Run the production build.
4. Exercise the browser acceptance matrix.
5. Remove obsolete settings-host CSS, state, callbacks, and migration-only
   aliases that are no longer needed at runtime.
6. Update `docs/STATUS.md` and the Feature 004 status when the feature is
   implemented.
7. Update the earlier inspection-workspace documentation so it no longer
   describes dockable panels as deferred for this product milestone.

## Test plan

### Unit tests

Add tests for:

- Supported dock values exclude top and accept left/right/bottom/floating.
- Default layout contains all eight active windows and no active `settings`
  window.
- Legacy settings-host preferences migrate correctly.
- Existing floating positions and dimensions survive migration.
- Invalid window IDs, duplicate order entries, and invalid sizes are rejected.
- Minimize/restore retains dock, size, position, order, and body state.
- Dock and floating size clamping.
- Floating position clamping after workbench resize.
- Window-order/z-index updates.
- Saved-layout round trips and legacy saved-layout loading.

### Component/browser tests

Verify:

- Each window can be docked left, right, bottom, and floating.
- There is no top-dock control or top-dock persisted value.
- Bottom dock spans the workbench width.
- Side docks stop above the bottom dock and do not cover the heading.
- Multiple windows in one dock remain ordered and usable.
- Each window minimizes and restores independently.
- Dock boundaries resize with pointer and keyboard.
- Floating windows move, resize, clamp, and change z-order.
- Tilemap appears only in Tilemap mode.
- Layout changes do not run conversion or mark conversion state dirty.
- Existing preview zoom, pan, inspection, editor, and content selection still
  work after promotion.

### Required commands

At minimum:

```text
pnpm run typecheck
pnpm test
pnpm run build
```

Browser verification must be performed at the supported desktop width and at
least one narrower responsive width.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Large App.tsx refactor changes conversion behavior | Move rendering shells first; preserve existing control handlers and IDs; run conversion tests after each phase. |
| Legacy layouts lose child-window positions | Add migration tests before deleting host fields; preserve explicit child fields first. |
| Multiple docked windows create unusable narrow panels | Define minimum widths/heights, deterministic stacking, and overflow behavior before styling. |
| Floating windows are clipped by grid/overflow contexts | Keep a workbench-level floating layer and render floating windows outside dock containers. |
| Minimized windows remain keyboard reachable | Hide bodies from layout and accessibility tree while retaining title bars. |
| Resize ARIA semantics become inaccurate | Test orientation/value ranges for each mode; use separate handles when needed. |
| Responsive CSS regresses existing mobile behavior | Treat narrow layout as an explicit phase with browser checks, not incidental wrapping. |

## Definition of done

- Feature 004 acceptance criteria are all verified.
- No top dock exists in code, persistence, or UI.
- No Conversion settings host remains in the rendered workbench.
- All eight active windows use the shared layout model and shell.
- Migration and saved-layout tests pass.
- Full typecheck, test, build, and browser verification pass.
- Documentation status is updated with any known limitations.
