# Retro Converter v1.0 release-evidence baseline

Date: 2026-07-24  
Authority: `RC-SRS-001` `1.0-draft.3`  
Status: engineering baseline; not final release approval

## Passing evidence

- Strict TypeScript checks pass across all workspace packages.
- Production Vite build passes and includes the manifest, icon, and service worker.
- 9 automated test files / 79 tests pass.
- Exact `.scr` size and validator checks pass.
- PNG/JPEG import, EXIF orientation, malformed-input rejection, deterministic geometry,
  adjustments, optimizer behavior, all dither modes, and artifact helpers are covered.
- Completed project containers are deterministic and reject altered hashes and unsafe paths.
- Browser workflow passed source import, Draft, High, stale export blocking, three artifact
  exports, project save/open reproduction, profile/preset semantics, and equal preview scale.
- Inspection helpers decode variable-height cells and bitmap bits, summarize normal/bright
  palette use, and produce lossless diagnostic reports under automated tests.
- Deterministic Gaussian smoothing and unsharp sharpening pass neutral, endpoint,
  edge-clamp, order, direct-entry, reset, metadata, profile, and project-round-trip checks.
- Optimizer version `rc-zx-variable-attribute-high-3` selects each attribute pair
  with a continuous, dither-independent score. The supplied red-to-yellow project
  produced zero attribute changes from 60% through 100%, including the former
  64–65% discontinuity; a synthetic gradient regression covers 64%, 65%, and 86%.
- Geometry version `rc-geometry-2` uses scale-aware separable Lanczos-3
  minification. A 768×576 one-pixel checkerboard reduces to a bounded neutral
  field in automated tests. Reprocessing the supplied 688×384 photograph reduced
  mean absolute pixel difference from the ImageJ reference from 10.52 in the
  supplied app capture to 2.50 in the corrected 256×143 output.
- Geometry version `rc-geometry-3` also makes bilinear minification scale-aware.
  The corresponding checkerboard regression produces a bounded neutral field.
  Corrected bilinear processing of the supplied photograph matches the ImageJ
  bilinear reference with mean absolute channel error 0.058 and RMSE 0.24.
- Optimizer version `rc-zx-variable-attribute-high-4` adds a fixed one-half
  binary span-variance penalty while preserving amount-independent attributes.
  Dithering version `rc-dither-2` performs whole-frame serpentine diffusion
  across cell boundaries. On the supplied cityscape, complementary cyan/red and
  yellow/magenta attributes fell from 290 to zero, broad pairs fell from 705 to
  107, and 100% pixel MSE fell from 5898.94 to 3738.40.
- Optimizer version `rc-zx-variable-attribute-high-5` applies that variance
  penalty only to opposing-channel pairs and the all-channel black/white
  diagonal, and hue-normalizes sufficiently chromatic samples for pair
  selection only. Monotone ramps such as black/red, black/cyan, red/yellow, and
  yellow/white retain a single pair across attribute boundaries; a desaturated
  red regression selects black/red while the existing dark-cyan regression
  continues to select black/cyan. The
  red-to-yellow regression now uses `0x16` throughout instead of switching
  among three locally preferred pairs. In the supplied cityscape, the first
  four attribute rows now use `0x02` continuously across all 32 columns.
- Dithering version `rc-dither-3` projects both incoming and outgoing diffusion
  error onto the current attribute pair's color axis. In the supplied 33%
  cityscape, the first full red/yellow attribute row changed from alternating
  yellow counts `209, 91, 214, 102…` to the smooth progression
  `146, 153, 157, 157, 162, 162, 164, 169`. A synthetic black/red-to-red/yellow
  boundary holds exactly 128 yellow pixels on every row after the transition.
- Draft worker replacement now occurs only after the 300 ms debounce expires.
  Rapid slider events cancel only the pending timer; they no longer terminate
  and create a worker for every intermediate input value.
- Optimizer `rc-zx-variable-attribute-high-6` and dithering `rc-dither-4`
  implement unrestricted local-pair diffusion followed by minimal 8×8
  attribute enforcement. In the supplied reference, 99 unrestricted cells use
  three colors; the restricted reference changes only the excluded third-color
  pixels. Reprocessing the supplied 256×192 source at the reference-like 20%
  setting matches 41,193 of 49,152 pixels exactly (83.8%), uses only
  black/red/yellow, and produces a visually continuous red/yellow transition.
  The fixed 20% attribute guide keeps attribute bytes identical when the user
  amount changes among 20%, 33%, and 100%.
- Optimizer `rc-zx-variable-attribute-high-7` and dithering `rc-dither-5`
  extend the same two-pass structure to ordered dithering. A whole-frame
  local-pair matrix guide is generated at a fixed 100%, attributes minimize
  guide-color replacement, and the requested matrix and amount are then
  rendered before only excluded colors are remapped. An automated three-color
  cell regression selects the two most-used guide colors and emits valid,
  canonical black/red attributes instead of the continuous-score black/yellow
  pair selected by the former attribute-first path.
- Optimizer `rc-zx-variable-attribute-high-8` and dithering `rc-dither-6`
  replace the ordered local-pair guide with independent RGB thresholding into
  the full enabled eight-color palette. On the supplied `wp8295184` reference,
  base-color agreement rose from 44,804 to 46,622 of 49,152 pixels (91.15% to
  94.85%); agreement in the top 64 rows rose from 87.62% to 94.69%. The
  constrained result now retains all seven reference colors, including white
  and blue highlights, rather than only five.
- Adjustments `rc-adjustments-filters-3`, optimizer
  `rc-zx-variable-attribute-high-13`, and dithering `rc-dither-10` port the
  supplied Java full-palette diffusion and ImageJ macro attribute pass. With
  gamma 190, dithering 20%, BRIGHT On, and 8×8 attributes, the supplied
  256×192 Agony source reproduces all 49,152 pixels of the constrained
  reference exactly. The macro regression also freezes dominant-color plus
  opposite-side-of-mean pair selection and its 2×2 intermediate-code remap.
  Attribute smoothing 0% retains that exact result. Independently selectable
  0–2 pixel horizontal and vertical halos use palette similarity plus
  harmonically normalized distance weights; vertical influence is suppressed
  for 8×1 and 8×2 attributes. The same pair-selection smoothing now applies to
  Ordered dithering without changing its matrix phase or unrestricted guide.
- The OsgDither checkerboard/Bayer tables were verified rank-for-rank and in the
  same orientation. Ordered conversion now selects an enabled palette pair plus
  discrete Osg coverage level instead of thresholding RGB independently. The
  supplied Bayer 4×4, 35% Agony project loses the diagonal color bands without
  Ordered noise. Error diffusion alone has an optional seed-1, signed,
  zero-mean randomizer; 0% preserves its prior output, and flat-field regression
  testing shows bounded tone drift and reduced periodic autocorrelation.
- Production application reloaded successfully after the local server was stopped,
  demonstrating the cached offline shell.
- Application source contains no telemetry, analytics, upload, WebSocket, beacon, or
  third-party service integration. Runtime fetches in `sw.js` are restricted to same-origin
  static application resources.

## Security and privacy boundaries

- Source and result data stay in worker/UI memory until explicit download.
- Persistent browser storage is limited to explicitly imported profile and preset data plus
  browser-managed offline resources.
- Project validation occurs before open-state replacement and enforces eight entries,
  normalized safe paths, no encryption or links, bounded sizes, declared hashes, and exact
  application/schema compatibility.
- Metadata excludes original filenames, local paths, source pixels, and user identity.

## Accessibility baseline

- Core actions use native keyboard-operable controls.
- Focus indicators, skip navigation, associated errors, atomic live status, busy state,
  Draft/High/stale labels, and reduced-motion handling are implemented.
- Layout stacks at narrow/zoomed viewport widths and does not rely on color alone for state.

## Open release gates

- Execute and record the frozen Chrome/Firefox/Safari browser and OS matrix.
- Generate and independently verify the final golden `.scr`, decoded-pixel, and metadata corpus.
- Run parser fuzzing and extended decompression/resource-exhaustion campaigns.
- Complete manual screen-reader checks on the supported accessibility matrix.
- Resolve controlled sRGB allow-list `TBD` items in `RC-DES-001`.
- Obtain document owner, approvers, approval date, legal/open-source review, and any waivers.

Until these gates close, the software is suitable for continued testing but should not be
represented as an approved v1.0 release.
