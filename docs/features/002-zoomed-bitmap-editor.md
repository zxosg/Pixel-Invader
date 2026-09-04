# Full-Bitmap Working-Source Editor

## Summary

Add a full-screen `Bitmap editor` pane for bitmap conversion mode. The editor displays the converted bitmap at high zoom, supports direct pixel editing, and keeps the second pane synchronized.

Manual result edits become a new `Working source`. The imported file remains the immutable `Original source`. Future conversions use the Working source, protecting manual edits from being silently replaced by the original image. Tilemap mode and the Unified tilemap editor remain out of scope.

## Source and result lifecycle

- Initially, Working source equals the imported Original source.
- The first manual result edit promotes the current rendered result to Working source.
- Original source is never modified.
- Convert always uses Working source.
- Color adjustments, geometry, palette controls, and dithering apply to Working source.
- Project save/open preserves Original source, Working source, and the edited flag.
- Revert source edits requires confirmation, restores Original source, clears bitmap history, and reconverts with current settings.

## Bitmap editor pane

- Add `bitmap-editor` to pane content preferences.
- Make it selectable in either main pane during bitmap conversion mode.
- Support independent pane zoom, synchronized pixel/cell selection, and independent scrolling.
- Reuse the existing bitmap editing model and history for both the full bitmap and cell views.
- Support all bitmap attribute-width and attribute-height variants represented by supported bitmap targets through a target-specific editing adapter.

The adapter exposes bitmap dimensions, attribute geometry, pixel/attribute access, artifact conversion, preview rendering, and export encoding.

## Zoom, grids, and interaction

- Migrate the old shared zoom preference into independent source/result zoom values.
- Support Fit and `1×` through `16×`; Bitmap editor defaults to `12×` when opened from Fit.
- Enable pixel and attribute grids in Bitmap editor mode.
- Left click and left drag edit pixels.
- Right or middle drag pans; Space + left drag also pans.
- The paint button cycles `Set → Reset → Toggle → None`; `None` leaves pixel data unchanged and permits attribute-only painting.
- Set/Reset are idempotent; Toggle affects each pixel once per stroke.
- Each click or drag stroke creates one history entry.

## Attribute paint policy

- Reserve a fixed right-side rail in the Bitmap editor pane for pixel actions and attribute controls. The rail remains visible while the zoomed canvas scrolls and never overlays bitmap pixels.
- Add visual-only INK/PAPER selectors with two columns (`I` and `P`) and eight rows of colored swatches.
- Add independent transparency controls for INK and PAPER, represented by an empty box with a diagonal grey line or transparency checkerboard. Transparent means preserve the existing attribute component.
- Add icon-only three-state BRIGHT and FLASH controls: set, reset, and transparent/preserve. FLASH updates the encoded bit even though animated display is not currently supported.
- Attribute policy is applied to the attribute cell touched by a click or drag. Pixel mode `None` applies attributes without changing pixels.
- Attribute edits respect the active target adapter’s attribute width and height. A stroke changes each crossed attribute cell at most once and preserves components marked transparent.
- Visible labels for colors, BRIGHT, and FLASH are omitted; tooltips and ARIA labels retain the full descriptions.

## Working-source editing and persistence

- Maintain immutable Original source, mutable Working source, and Converted result separately.
- Promote the active rendered result into Working source on the first edit.
- Display `Working source · manually edited` and explain that Convert may reprocess edits.
- Save edited Working source as `source/working.png` in projects.
- Bump the project schema while accepting legacy projects without a Working source.
- Use Working source for subsequent Draft and High conversions.
- Export the current result to binary and PNG.

## History and actions

Provide an extensible editor toolbar containing:

- Paint mode
- Undo
- Redo
- Revert source edits

The toolbar also contains the compact visual attribute-paint policy controls described above. Selecting a policy does not modify the image until the user paints on the bitmap.

Undo and Redo operate on Working-source bitmap snapshots. New edits clear Redo. Zoom, pane selection, paint mode, and focus changes do not create history. Revert is separate from Undo and requires explicit confirmation before discarding manual edits.

## Workspace preset

Add an `Editor` preset for bitmap mode:

- Left pane: Result image.
- Right pane: Bitmap editor.
- Pixel grid: on.
- Attribute grid: on.
- Zoom: `12×`.
- Independent pane zoom: on.
- Pan synchronization: off by default.

Keep Bitmap editor unavailable in tilemap mode and show a clear explanation for unsupported bitmap targets.

## Tests and verification

Cover buffer immutability, arbitrary attribute geometry, Set/Reset/Toggle/None behavior, logical attribute-aware colors, attribute policy preservation, drag deduplication, independent zoom migration, Working-source project round trips, Revert state, and legacy project compatibility. Run TypeScript validation, the full Vitest suite, production build, and browser verification of the pane selector, Editor preset, right-side action rail, and attribute controls.
