# RC-SRS-001 v1.0-draft.3 traceability baseline

| Requirement group | Implementation evidence | Verification status |
|---|---|---|
| `FR-IMPORT-*`, `FR-DET-*` | `packages/image-codecs`, worker decode boundary | Automated PNG/JPEG, malformed input, EXIF, ICC/APNG rejection tests pass |
| `FR-EDIT-001..010`, `015..030` | `geometry.ts`, `filters.ts`, `adjustments.ts`, `crop.ts`, compact accessible controls | Fit/Fill/Crop/Stretch, pixel crop selection, bounded pointer and one-pixel keyboard movement, selection clearing/reselection, aspect locks, focal position, rotation, mirror, three resamplers including scale-aware bilinear and Lanczos strong-minification anti-aliasing, deterministic smoothing/sharpening, color adjustments, and dither controls tested |
| `FR-EDIT-011..013` | Undo/redo | Deferred by explicit product direction; not claimed implemented |
| `FR-OPT-*`, `FR-JOB-*` | `convert.ts`, worker protocol/client, transactional UI | Deterministic Draft/High, fixed-guide local-pair optimization with minimal attribute remapping and amount-independent attributes, hue-normalized continuous scoring, desaturated red and dark-cyan ramp preservation, debounce-after-input worker replacement, cancellation, stale suppression, and export guards tested |
| `FR-EDIT-017..019`, `FR-ZX-*`, `FR-DITH-*`, `FR-SCR-*` | conversion core, eight-base-color controls, and `zx-spectrum` software-mode serializer/validator | 8×8/8×4/8×2/8×1 layouts and exact sizes, attribute-wide BRIGHT Auto/On/Off, base-code restrictions, prohibition of cross-plane pairs, FLASH prohibition, canonical attributes, matrices, amount endpoints, whole-frame local-pair ordered and serpentine-diffusion guides with post-dither attribute enforcement, pair-axis error projection, and validation tested |
| `FR-PREV-001..010` | preview canvas, inspection workspace, and `inspection.ts` | exact pixel rendering, persisted border, true-pixel 1:1–8:1 zoom, synchronized pan without feedback, boundary-aligned pixel/variable attribute grids, before/after views, cell decoding, palette usage, keyboard navigation, and diagnostic report generation covered |
| `FR-PREV-*` | exact RGBA canvas preview and labelled preview states | Exact decoded pixels tested; calibrated physical-display claims intentionally excluded |
| `FR-EXP-*`, `FR-META-*` | `artifacts.ts`, metadata schema | `.scr`, PNG, JSON, hashes, filenames, complete settings, and export-state gating tested |
| `FR-PROJ-*` | `projects.ts` | Deterministic eight-entry ZIP, manifest, hashes, limits, unsafe-path/tamper rejection, and browser save/open reproduction tested |
| `FR-PROF-*` | `profiles.ts` | Declarative schema, limits, reference rejection, protected built-in, complete presets, hashing, retention, and deletion tested |
| `NFR-PRIV-*`, offline | no telemetry/network application code; production service worker | Local-only architecture inspected; production reload passed after server shutdown |
| `NFR-A11Y-*` | semantic native controls, skip link, focus styles, live status, busy state, reduced motion | Semantic browser snapshot and keyboard-native control review passed; screen-reader matrix remains open |
| `NFR-COMP-*`, `NFR-QUAL-*` | strict TypeScript, production build, deterministic tests | Current desktop browser passed; independent multi-browser/OS corpus remains open |

This file is traceability evidence, not final release approval. Any open row requires
execution evidence or an approved waiver before the draft can be promoted to approved.
