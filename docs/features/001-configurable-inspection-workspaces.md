# Feature 001 — Configurable Inspection Workspaces

## Status

Proposed

## Summary

Allow the two primary preview windows to display user-selectable content while keeping conversion controls and inspection tools organized by context.

The feature should make the application useful both as a straightforward image converter and as an analytical workstation for examining source data, generated output, palettes, cells, tiles, and manual corrections.

The screenshot supplied with this proposal is a visual reference only. It does not introduce additional product requirements.

## Goals

- Let each primary preview window display a selected view such as source, result, palette usage, or tile usage.
- Keep source and output views coordinated through shared selection and highlighting.
- Make geometry, adjustments, dithering, palette, tilemap, and editing controls easier to locate.
- Support target-specific output views, including multiple screens and physical/analytic previews.
- Preserve deterministic conversion and export behavior.
- Provide a foundation for reusable workspace presets.

## Non-goals

- Fully free-form desktop-style window management in the first iteration.
- Making workspace layout affect conversion results or project hashes.
- Adding arbitrary executable or user-defined conversion logic.
- Replacing the existing exact preview requirements with decorative effects.

## Proposed model

Use two configurable view slots instead of unrestricted floating panels.

Each slot has:

- A content type.
- Independent zoom, pan, and overlay state.
- Optional linkage to the other slot.
- A shared selection target when applicable.

Suggested content types:

- Source
- Adjusted source
- Pre-constraint/dither preview
- Output screen 1
- Output screen 2
- Merged output
- Physical output
- Analytic output
- Palette usage
- Used tiles
- Cell/attribute inspector
- Difference/error view
- Quality and diagnostics

Content availability must be target-aware. For example, a single-screen target should not expose nonexistent screen tabs, and tile views should be available only when tilemap data exists.

## Shared inspection state

Views should coordinate around a common selection model with these levels:

- Pixel
- Attribute cell
- Tile
- Palette color
- Output screen/frame

Selecting an item in one view should highlight related data in other views where possible. A selected output cell should, for example, identify its corresponding source region, palette pair, attribute bytes, bitmap bits, tile ID, transformation, and usage count.

The selection model is view state and must remain separate from conversion settings and conversion identity.

## Primary preview behavior

The two main windows should support:

- Swap views.
- Independent or synchronized pan.
- Independent or synchronized zoom.
- Fit-to-window.
- Pixel and cell overlays where meaningful.
- Before/after comparison.
- Keyboard-accessible focus and navigation.
- Target-specific screen/frame selection.

The output window should use precise labels such as `Output: Screen 1`, `Output: Merged`, `Output: Physical`, or `Output: Analytic` rather than always using `Destination`, because some targets produce multiple or derived outputs.

## Configuration organization

Group configuration panels into three sections:

### Image preparation

- Geometry and framing
- Crop
- Rotation and mirroring
- Resampling
- Brightness, contrast, saturation, and gamma
- Smoothing and sharpening
- Alpha/background handling

### Conversion

- Target hardware
- Attribute/cell geometry
- Palette selection and BRIGHT policy
- Dithering method, matrix, and amount
- Optimizer/engine
- Charset source and tile mapping
- Temporal or spatial mixing

### Inspection and editing

- Pixel/cell/tile inspector
- Bitmap editor
- Tile editor
- Palette usage
- Difference/error view
- Quality metrics
- Diagnostics and export information

Controls should remain contextual. A source view should expose crop-related tools; a result view should expose cell and output overlays; a tile view should expose tile actions.

## Tile usage view

For tilemap mode, provide a tile table or grid showing:

- Tile ID
- Usage count and percentage
- Locations/cells using the tile
- Used/unused status
- Base tile and transformation

Actions should include selecting all occurrences, editing, sorting by ID or usage, filtering used/unused tiles, duplicating before edit, and warning when an edit affects many cells.

Usage reporting should distinguish base tile identity from rotated/reflected effective appearance.

## Palette usage view

Support at least these filters or modes:

- Enabled palette
- Actually used colors
- Usage count and percentage
- Usage by screen
- Usage by cell
- INK/PAPER pair usage
- BRIGHT/normal plane usage
- Before/after color mapping

An initial implementation may expose this as a configurable view with a `Used only` toggle rather than a separate permanent panel.

## Bitmap editor

Add a zoomed editor for a selected cell or tile with:

- Pixel toggle, paint, and erase.
- Invert, shift, and mirror operations.
- INK/PAPER or attribute editing where supported.
- Tile ID and transformation editing for tilemaps.
- Source-region overlay.
- Before/after cell error information.

Manual edits should be represented as a post-conversion edit layer. The UI should clearly show the number of overrides, and rerunning conversion must either preserve them by explicit design or warn that they will be discarded.

Because manual editing increases the importance of reversibility, provide scoped undo/redo for editor operations even if application-wide undo/redo remains deferred.

## Workspace presets

Support saved layout presets such as:

- `Conversion`: source + output, image preparation visible.
- `Palette tuning`: adjusted source + palette usage, palette controls visible.
- `Tilemap cleanup`: reconstruction + used tiles, tile editor visible.
- `Pixel inspection`: output + bitmap inspector, high zoom and cell grid.
- `Comparison`: source + output difference, metrics visible.

Workspace presets should save view arrangement, visibility, linkage, and inspection preferences. They should not silently change conversion settings unless explicitly saved as a full conversion preset or project.

## State boundaries

Keep these state categories separate:

1. Conversion state — settings that affect generated output and serialized project results.
2. View state — selected content, zoom, pan, overlays, and panel visibility.
3. Inspection state — current pixel/cell/tile/palette selection and linked highlights.
4. Edit state — post-conversion manual overrides and their history.

Only the first and explicitly defined fourth category may affect exported output. View and inspection state must not affect conversion determinism, quality scores, artifact hashes, or project reproduction.

## Implementation phases

1. Add a content selector to each primary preview window.
2. Extract existing preview, palette, tile, and inspection UI into reusable view components.
3. Add shared selection and cross-view highlighting.
4. Add contextual collapsible configuration groups.
5. Add the used-tile and richer palette usage views.
6. Add a scoped bitmap/cell editor with post-conversion edit state.
7. Add workspace presets.
8. Consider detachable or dockable panels only if usage demonstrates a need.

## Acceptance criteria for the first iteration

- Both primary windows can independently select from the applicable source/result/inspection views.
- Switching view content does not start a conversion or change exported bytes.
- Zoom and pan behavior remains accessible and supports optional synchronization.
- Output labels accurately describe single-screen, multi-screen, physical, analytic, and merged results.
- Existing palette and tilemap functionality remains available.
- Selecting a cell or tile exposes its related information without losing the current conversion result.
- The layout remains usable at desktop and narrower responsive widths.
- Existing deterministic conversion and project reproduction tests continue to pass.

## Relevant existing implementation

- `apps/web/src/App.tsx` contains the current preview, palette, tilemap, and inspection composition.
- `apps/web/src/styles.css` contains the current desktop workstation and responsive layouts.
- `apps/web/src/inspection.ts` contains inspection and palette-usage logic.
- `Retro_Converter_SRS_v1.0-draft.3.md` defines the normative preview, inspection, determinism, and export constraints.
