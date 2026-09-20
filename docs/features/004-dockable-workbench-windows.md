# Feature 004 — Dockable Workbench Windows

## Status

Proposed — specification only; implementation has not started.

## Summary

Make the conversion workbench behave as a set of independent windows that can
be docked, minimized, resized, or floated. Remove the redundant `Conversion
settings` group window and promote each of its current sub-windows to a
top-level workbench window.

The feature preserves conversion behavior and existing minimize behavior. It
changes only the organization, placement, sizing, and visibility of workbench
UI.

## Goals

- Treat every workbench panel as an independent window.
- Allow each window to be docked on the left, right, or bottom edge, or placed
  in a floating resizable window.
- Keep minimized windows available through their title bar without consuming
  their full content area.
- Allow dock sizes to be adjusted directly by dragging the dock boundary.
- Make bottom docks span the full application/workbench width.
- Keep side docks inside the vertical space between the workbench top and the
  bottom dock, so they cannot overlap either boundary.
- Preserve window positions, sizes, dock assignments, minimized state, and
  stacking order in workbench preferences and saved workspace layouts.
- Keep layout state separate from conversion state and conversion output.

## Non-goals

- A top dock. Top docking is explicitly excluded from this feature.
- Changing conversion algorithms, settings, previews, or export formats.
- Dragging a window directly from one dock to another. Dock controls may be
  used for the first implementation.
- Arbitrary windows outside the defined workbench window registry.
- Making floating or docked layout affect conversion determinism, quality
  scores, artifact hashes, or serialized conversion settings.

## Window inventory

The following windows are top-level workbench windows:

- Geometry
- Image adjustments
- Palette controls
- Dithering controls
- Tilemap controls, when tilemap mode is active
- Tools
- Source preview
- Result preview

The `Conversion settings` host window is removed. It must not remain as a
visible, focusable, positioned, or layout-owning parent for these windows.

The profile/preset controls remain part of the main workbench form unless a
later feature promotes them into their own window.

## Window layout model

Every registered window has layout state equivalent to:

```ts
type WorkbenchDock = "left" | "right" | "bottom" | "floating";

interface WorkbenchWindowLayout {
  dock: WorkbenchDock;
  minimized: boolean;
  dockSize: number;
  floatingX: number;
  floatingY: number;
  floatingWidth: number;
  floatingHeight: number;
  open: boolean;
}
```

The exact TypeScript shape may differ, but the persisted model must provide
the same capabilities for every window. Window-specific fields are acceptable
when a panel needs a different minimum or default size.

The existing z-order/window-order concept should be retained for floating
windows. Interacting with a floating window brings it to the front. Docked
windows remain in the dock layout order and do not overlap one another.

## Docking behavior

### Left and right docks

- A side dock occupies only the central workbench band.
- Its top edge begins below the workbench's top content boundary.
- Its bottom edge ends above the bottom dock boundary.
- It must not cover the bottom dock, the main workbench heading, or another
  side dock.
- The dock width is adjustable by dragging its inner boundary.
- The left dock is laid out before the main content; the right dock is laid
  out after the main content.

If multiple windows are assigned to the same side, they are stacked in that
side dock in deterministic window order. The side width is shared by that dock
strip; individual windows may be minimized or collapsed without changing the
strip width.

### Bottom dock

- The bottom dock spans the complete workbench/application content width.
- It is laid out below the main content and below any side dock's usable
  height.
- Its height is adjustable by dragging its top boundary.
- Multiple bottom-docked windows are siblings in one bottom strip and retain a
  deterministic order.
- Minimizing a bottom-docked window removes its content height while retaining
  its title bar and window actions.

The specification uses “full application width” to mean the width of the
workbench surface inside the application shell, excluding browser chrome and
the operating-system window frame.

### Floating windows

- A floating window is positioned relative to the workbench surface.
- It may overlap the central preview or other floating windows.
- It is movable by its title bar and resizable from a visible resize handle.
- Width and height are independently constrained by minimum and maximum values.
- Floating coordinates and dimensions are clamped when the workbench changes
  size so that the title bar remains reachable.
- A floating window is brought to the front when focused, clicked, or resized.

### Minimized windows

- Every top-level window has a minimize/restore action.
- Minimize keeps the title bar, window name, dock controls, and restore action
  visible.
- Minimize hides the window body and its resize handle.
- Restoring returns the window to its previous dock, size, position, and open
  section state.
- Minimize does not change the window's dock assignment.
- A minimized floating window remains at its previous floating position and
  retains its z-order.

The existing Conversion settings minimize behavior is the baseline interaction
to preserve while moving the behavior to individual windows.

## Window controls

Each title bar provides:

- Window title.
- Minimize or restore.
- Dock-left action.
- Dock-right action.
- Dock-bottom action.
- Float action, or return-to-dock action when floating.

Controls must expose the current state through `aria-pressed`, `aria-expanded`,
or an equivalent semantic attribute. Icon-only controls require accessible
names and tooltips. The active dock must be visually distinct without relying
on color alone.

The reset-layout action may remain global rather than being repeated in every
window title bar.

## Resizing behavior

### Pointer interaction

- Left/right dock resize handles use an east-west resize cursor.
- Bottom dock resize handles use a north-south resize cursor.
- Floating resize handles use a diagonal resize cursor.
- Pointer capture or an equivalent document-level move listener must keep the
  resize active when the pointer leaves the handle.
- Resizing must stop on pointer-up, pointer-cancel, or component teardown.
- Content must scroll rather than force the workbench beyond the configured
  dock bounds.

### Keyboard interaction

Every resize handle is keyboard reachable and exposes its current size through
separator semantics. Arrow keys adjust the size in small increments; Shift plus
an arrow uses a larger increment. The handle must expose the correct axis and
value range for the active dock mode.

Floating resize semantics must not report only the height when both width and
height are being changed. Use separate handles or an appropriate accessible
description if both dimensions cannot be represented by one separator.

### Size constraints

The implementation must define and test minimum sizes for each window class.
Minimums must preserve usable title bars, controls, and scrollable content.
The current settings and preview minimums may be used as initial values, but
they must be applied per top-level window rather than to the removed host.

## Persistence and migration

Layout preferences are stored independently from workspace conversion
preferences. They include, for every window:

- Dock assignment.
- Minimized state.
- Open/closed body state where applicable.
- Dock size or shared dock size.
- Floating position and dimensions.
- Floating auto-height preference, where applicable.
- Window order and z-order.

The persisted preference format must be versioned or migrated explicitly.
Existing layouts containing the `settings` host must remain loadable:

- The host's dock and minimized state become the default state for its promoted
  child windows unless a child-specific value already exists.
- Existing floating child positions and sizes are retained.
- The legacy `settings` window is removed from the active order after loading.
- Invalid or incomplete layout data falls back safely to defaults without
  affecting conversion settings or imported projects.

Saved workspace layouts must round-trip the complete window arrangement.
Loading a saved layout must not alter conversion values unless those values
are explicitly part of a separate conversion preset.

## Responsive behavior

The desktop dock model applies when the workbench has enough horizontal space
to satisfy all active minimum widths. At narrower widths:

- Side docks may collapse into the existing stacked responsive layout.
- Floating windows must remain reachable and must not render outside the
  workbench viewport.
- Dock controls must remain usable without horizontal page overflow.
- The application must not silently discard persisted desktop layout state;
  it should restore that state when the viewport becomes wide enough again.

The exact breakpoint may remain the existing desktop breakpoint, but the
fallback behavior must be tested rather than left to incidental CSS wrapping.

## State boundaries

Window layout is view state. It must remain separate from:

1. Conversion state — settings that affect generated output.
2. Source/project state — imported and edited source data.
3. Inspection state — selected pixels, cells, tiles, and palette items.
4. Window layout state — dock, minimized, size, position, visibility, and
   order.

Changing dock placement, minimizing, restoring, moving, or resizing a window
must not trigger conversion or mark the project as having unsaved conversion
changes.

## Acceptance criteria

1. The visible `Conversion settings` group window no longer exists.
2. Geometry, Image adjustments, Palette, Dithering, and Tilemap controls are
   independently addressable top-level windows.
3. Tools, Source preview, and Result preview are independently addressable
   top-level windows.
4. Every top-level window can be assigned to left, right, bottom, or floating.
5. No UI control, persisted type, or CSS rule exposes a top dock.
6. Every top-level window can be minimized and restored without losing its
   dock assignment, position, size, or body state.
7. Left and right docks never overlap the bottom dock or the workbench's top
   content boundary.
8. Bottom-docked windows span the complete workbench/application content
   width.
9. Dock boundaries can be resized by pointer dragging and by keyboard.
10. Floating windows can be moved and resized, remain within reachable bounds,
    and maintain deterministic z-order behavior.
11. Layout preferences persist across reloads and saved workspace round trips.
12. Existing preferences containing the Conversion settings host migrate
    without loss of usable child-window layout information.
13. Layout changes do not start conversions, change exported bytes, or modify
    conversion/project dirty state.
14. The layout remains usable at the supported desktop breakpoint and at
    narrower responsive widths.
15. Automated tests cover dock assignment, migration, minimizing, resizing
    constraints, and saved-layout round trips.
16. Browser verification covers each dock mode, minimized state, resize path,
    focus order, and side/bottom non-overlap.

## Suggested implementation phases

1. Define the versioned per-window layout model and migration from the current
   Conversion settings host.
2. Extract a reusable top-level dockable-window shell with title bar, actions,
   minimize behavior, resize handles, focus handling, and z-order handling.
3. Promote conversion sections out of the host window without changing their
   controls or conversion state.
4. Build the workbench layout regions for left, center, right, and bottom.
5. Move Tools and both preview panes onto the shared window shell.
6. Add persistence and saved-workspace round trips.
7. Add responsive fallback behavior and accessibility coverage.
8. Run the full typecheck, test suite, production build, and browser
   acceptance matrix.

## Relevant existing implementation

- `apps/web/src/App.tsx` contains the current workbench state and composition.
- `apps/web/src/styles.css` contains the current desktop workbench layout,
  floating windows, and resize handles.
- `apps/web/src/workbench-preferences.ts` contains persisted dock, window,
  size, and order preferences.
- `apps/web/src/saved-workbench-layouts.ts` contains saved workspace layout
  persistence.
- `apps/web/src/workbench-preferences.test.ts` and
  `apps/web/src/saved-workbench-layouts.test.ts` contain the existing layout
  persistence tests.
