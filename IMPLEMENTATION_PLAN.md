# Retro Converter v1.0 Implementation Plan

## Implementation status — 2026-07-26

- Feature milestone 15 vertical spatial mixing: implemented deterministic static
  50/50 linear-sRGB row-pair mixing for ZX 8×1 software attributes, QL Mode 8
  and Mode 4, and native-color PMD 85 targets. The immutable Version 1 engine
  uses exhaustive legal candidates, Q16 scoring, existing codecs, physical /
  analytic / split previews, schema-12 projects, schema-7 profiles, and
  schema-4 metadata. The spatial targets now support deterministic None,
  ordered-matrix, and cell-aware error-diffusion methods at the logical
  row-pair level, with the Analytic tab reporting the actually used mixed
  palette. Measured calibration, CRT simulation, and ZX player exports remain
  intentionally deferred.

- Phases 1–5: implemented baseline with deterministic import, geometry, adjustments,
  ZX optimization, dithering, serializer validation, and automated tests.
- Phase 6: implemented debounced Draft jobs, explicit High jobs, cancellation,
  stale-result suppression, and export-state guards.
- Phase 7: implemented exact preview, validated `.scr`/PNG/metadata exports,
  deterministic filenames, and completed-final `.rccproject` save/open reproduction.
- Phase 8: implemented declarative profile/preset validation and retention plus a
  local-only offline application shell; production offline reload is verified.
- Phase 9 is the final pre-release gate and is intentionally postponed until
  all feature milestones are complete. Its accessibility and release-evidence
  baseline exists; independent browser/OS execution, fuzzing, and final
  golden-corpus approval remain open.
- Feature milestone 10: implemented synchronized zoom/pan, source/result switching,
  pixel and variable-height attribute grids, keyboard-accessible cell inspection,
  palette-usage visualization, persisted border color, and diagnostic JSON export.
- Feature milestone 11: implemented deterministic Gaussian smoothing and unsharp
  sharpening, compact slider/direct-entry controls, reset behavior, complete
  settings persistence, metadata versioning, and regression tests.
- Feature milestone 11 optimizer correction: decoupled continuous attribute-pair
  scoring from bitmap dithering, removed amount-driven 8×8 color-block changes,
  versioned the optimizer, and added gradient boundary regression coverage.
- Feature milestone 11 resampling correction: replaced fixed-footprint Lanczos
  minification with a scale-aware separable low-pass implementation, versioned
  geometry metadata, and added strong-reduction aliasing regression coverage.
- Feature milestone 11 bilinear correction: replaced fixed four-sample
  minification with a scale-aware separable triangle filter and verified the
  supplied photograph against the ImageJ bilinear reference.
- Feature milestone 11 palette-dither correction: added a fixed pair-span
  variance penalty and whole-frame serpentine error diffusion, eliminating
  complementary-pair artifacts in the supplied cityscape while retaining
  amount-independent attributes.
- Feature milestone 11 Ordered/randomization extension: implemented Osg-style
  palette-pair coverage for Ordered dithering without noise, plus deterministic,
  adjustable signed decorrelation for Error-diffusion limit cycles.
- Feature milestone 12: implemented immutable attribute-optimizer and dither-engine
  registries, pre-constraint and multi-screen preview tabs, on-demand engine
  benchmarking, and platform-neutral multi-frame worker results.
- Feature milestone 12 Sinclair QL: implemented 256×256 Mode 8 and 512×256 Mode 4,
  fixed 50/50 two-screen color mixing, exact 32 KiB encoders/validators with Mode 8
  FLASH disabled, adaptive profile controls, two-screen exports, and v2 projects.
- Feature milestone 12 Sinclair QL plain modes and display geometry: added direct
  single-screen hardware-palette conversion for both QL modes, stored a 4:3
  monitor ratio in profiles, used that ratio for Fit, and reserved discrete
  zoom levels for exact logical-pixel inspection.
- Feature milestone 12 QL Ordered local-tone correction: added immutable
  `ordered-local-tone-v3`, which selects mixed virtual-palette endpoints using
  the effective amount-scaled average plus a local variance cost. This preserves
  `ordered-unrestricted-v2` while reducing high-contrast Bayer endpoints in QL
  mixed modes; plain QL and ZX output behavior remains unchanged.
- Feature milestone 12 cross-platform Ordered correction: added immutable
  `ordered-palette-pairs-v4`. It replaces QL's nearest-first shortcut with the
  same exhaustive palette-pair and matrix-coverage candidate model used by ZX,
  accelerated by a deterministic RGB nearest-neighbor tree. QL Mode 8 plain
  pre-constraint output now exactly matches ZX BRIGHT ON for equivalent source
  pixels, palette, matrix, and amount; mixed QL applies the same model to its
  virtual palette.
- Feature milestone 12 QL mixed Ordered continuity: added immutable
  `ordered-baseline-additive-v5`. Mixed QL conversion now starts with the exact
  no-dither virtual-palette color at 0% and progressively adds matrix coverage
  toward a second virtual color. Fractional matrix levels use a deterministic
  hierarchical 8×8 tile phase, removing the former 55%, 27%, and 7% activation
  dead zones for 2×1, 2×2, and 4×4. This experimental version remains available
  for benchmark comparison.
- Feature milestone 12 QL strict Ordered correction: added immutable
  `ordered-strict-matrix-v6`. It removes v5's visible secondary 8×8 tile phase,
  constrains mixed output to the exact selected matrix period, and preserves the
  no-dither virtual color as its baseline. The unavoidable local coverage steps
  of small matrices can leave low percentage ranges unchanged. Plain QL and ZX
  retain v4's exhaustive hardware-palette behavior.
- Feature milestone 13 structured ZX research engine: implemented the coupled
  `zx-structured-global-v1` + `ordered-cell-pattern-v1` engine family. Version 1
  uses canonical legal shared-BRIGHT pairs, quantized OKLab integer scoring,
  versioned linear-light mixtures and response parameters, exact per-pixel
  zero-dither masks, physically realizable 2×2 blocks (2×1 for 8×1 attributes),
  deterministic shortlist pruning, bounded coordinate descent, rendered
  direction-aware boundary costs, and an independently optimized unrestricted
  structured preview. Coupled compatibility is enforced by the registry, UI,
  benchmark, profile loader, and project loader. Structured projects use schema
  Version 3 and expose objective components in metadata.
- Feature milestone 13 structured response correction: retained the immutable
  Version 1 pair and added `zx-structured-global-v2` +
  `ordered-cell-pattern-v2`. Version 2 rebalances endpoint-pixel and perceived
  mixture error and uses an earlier-response amount curve, eliminating the
  Version 1 failure where even 100% could reproduce the no-dither mask.
- Feature milestone 13 structured color-balance correction: retained Versions
  1 and 2 and added `zx-structured-global-v3` +
  `ordered-cell-pattern-v3`. Version 3 adds a separately reported sRGB anchor
  term to prevent unrelated complementary endpoints, particularly red/cyan,
  from being selected solely for their perceptual average.
- Feature milestone 13 structured topology correction: retained Versions 1–3
  and added `zx-structured-global-v4` + `ordered-cell-pattern-v4`. Version 4
  separates nearest-palette label occupancy from the unrestricted ordered
  pattern reference and adds luminance-rank, edge-polarity, locally admissible
  candidate, and capped-boundary terms. This preserves the color-balance repair
  while restoring deliberate pixel structure and edge detail.
- Feature milestone 13 diffusion decorrelation: added immutable
  `error-diffusion-decorrelated-v3` for ZX and QL. The wider deterministic
  two-row Stucki kernel breaks short Floyd–Steinberg feedback loops, while the
  randomizer now affects QL as well as ZX. Historical diffusion engines remain
  unchanged for benchmarks and project reproduction.
- Feature milestone 13 workflow and adjustment corrections: benchmark rows now
  survive applying a result because engine-private structured settings are not
  part of the shared benchmark cache identity. Gamma now spans 33–300%.
- Feature milestone 14 Halo v2: added immutable
  `zx-guide-reference-halo-v2`, a separate 0–400% halo-influence control,
  perceptual palette similarity, adjusted-source edge protection, a 1.5×
  in-cell evidence cap, and corpus-calibrated 137% production/200% strong
  presets. Halo v1 remains unchanged.
- Feature milestone 14 dither laboratory: added benchmark-only lifecycle
  descriptors and an explicit Experimental benchmark switch. Frozen candidate
  engines include clustered-dot 4×4/8×8, an isotropic void-and-cluster 8×8
  pattern, Atkinson serpentine diffusion, Riemersma Hilbert-path diffusion, and
  the coupled `zx-block-dbs-global-v1` + `pattern-legal-mask-dbs-v1` family.
  The DBS engine initializes from Halo v2, evaluates deterministic legal
  attribute-pair proposals, and performs alternating legal 2×2/2×1 single-bit
  mask sweeps against a symmetric reconstruction/edge/texture/boundary objective.
- Feature milestone 15 ZX temporal mixing: added a selectable 256×192 two-screen
  target using a 50/50 virtual palette, separate legal attribute enforcement for
  both physical frames, complete-cell endpoint orientation, merged preview,
  screen tabs, paired `.scr` exports, metadata, and project reproduction.
  Screen flicker suppression is selectable: ZX alternates whole attribute cells,
  QL alternates individual pixels, and disabling it preserves fixed frame order.
- Feature milestone 12 QL output-stage retention: output-tab selection now
  survives draft scheduling, parameter changes, and temporary absence of a
  preview. It resets only when the selected target genuinely produces one
  screen. Regression tests confirm that No dithering remains uniform in Merged
  and that the 2×1 and 2×2 Ordered guides are distinct; the physical screens'
  intentional temporal pair-balancing phase remains unchanged.
- Feature milestone 12 no-dither correction: added immutable
  `none-discrete-v2`, which selects ZX attributes from the displayed unrestricted
  palette guide, scores discrete endpoints, canonicalizes uniform cells, and keeps
  `none-v1` available for exact historical project reproduction.
- Feature milestone 12 unrestricted-guide correction: added immutable Ordered and
  Error-diffusion v2 engines whose pre-attribute palette buffers are independent
  of ZX attribute height and shared BRIGHT cells; the attribute-aware v1 engines
  remain available for reproduction and engine comparison.
- Feature milestone 12 benchmark-cache completion: benchmark results now retain a
  deterministic source/settings identity, remain available while selecting ranked
  engine axes, and are invalidated with obsolete workers cancelled whenever any
  relevant source or conversion input changes.
- Feature milestone 12 engine/QL usability correction: the last selected engines
  persist as local startup preferences, No-dither switching preserves the retained
  amount, QL profile actions share a compact aligned row, and QL Ordered conversion
  uses matrix/amount-controlled virtual-palette coverage dithering.
- Undo/redo is explicitly deferred by product direction.

## 1. Objective

Deliver a local-only browser application that converts static PNG and JPEG images into deterministic ZX Spectrum `.scr` files using the 256×192 bitmap and selectable 8×8, 8×4, 8×2, or 8×1 software attribute cells.

This plan implements the minimum viable v1.0 agreed after review of `RC-SRS-001`:

- ZX Spectrum 48K bitmap with standard 8×8 and defined 8×4/8×2/8×1 software attribute modes
- Static PNG and JPEG input
- Untagged sRGB and explicitly recognized sRGB sources only
- `Draft` and `High` conversion levels; no `Maximum` level
- `No dithering`, `Ordered`, and `Error diffusion` methods
- Integer dithering amount from 0% through 100%
- Completed-final project saving only; no work-in-progress project files
- Semantic metadata determinism; bit-identical `.scr` output
- Declarative, non-executable profiles and presets
- Local operation, explicit export, offline core workflow, and no telemetry
- Enumerated accessibility requirements without claiming complete WCAG 2.2 AA conformance
- No project migration, controlled update activation, or application rollback in v1.0

## 2. Delivery principles

1. Build the deterministic conversion core before building the full interface.
2. Keep normative image processing independent of browser canvas decoding and rendering.
3. Use integer or explicitly rounded arithmetic for every operation that affects `.scr` bytes.
4. Treat every imported file as untrusted and validate before allocation or state replacement.
5. Keep UI state, conversion jobs, and completed results transactionally separate.
6. Require golden fixtures and cross-browser comparisons at each conversion milestone.
7. Defer features rather than introduce weak or ambiguous implementations into v1.0.

## 3. Proposed technical shape

### 3.1 Repository layout

```text
OsgConvert/
  apps/
    web/                    React application, PWA shell, accessibility
  packages/
    conversion-core/       Deterministic pipeline and ZX optimizer
    image-codecs/          Versioned PNG/JPEG decoding boundary
    zx-spectrum/           Palette, screen model, serializer, validator
    contracts/             Types, schemas, stable errors, metadata
    profiles/              Built-in profile and preset data
    test-support/          Corpus loaders, golden comparisons, helpers
  specs/
    RC-DES-001.md           Controlled conversion design
    schemas/                Profile, metadata, and final-project schemas
    verification/           Test procedures and traceability
  tests/
    corpus/                 Small checked-in conformance fixtures
    golden/                 Independently verified `.scr` and hashes
    browser/                Cross-browser workflow tests
  tools/                    Corpus, schema, and release-evidence tooling
```

Use a pinned workspace package manager, TypeScript strict mode, reproducible lockfile, formatting, linting, unit tests, browser tests, and a CI build from the first commit.

### 3.2 Runtime boundaries

```text
React UI
  -> validates commands and manages visible state
  -> sends immutable conversion requests

Conversion Web Worker
  -> decodes and normalizes input
  -> applies deterministic transforms
  -> optimizes ZX cells with selected dithering
  -> serializes and validates `.scr`
  -> returns immutable result plus metrics and warnings

Export layer
  -> checks result identity and final state
  -> creates `.scr`, preview PNG, metadata, and final project container
```

The UI may use canvas to display already-decoded result pixels. Canvas must not be used for normative source decoding, resampling, adjustment, or export decisions.

### 3.3 Determinism policy

- `.scr` bytes, cell attributes, decoded preview pixels, metrics, and deterministic metadata fields must match across the supported matrix.
- Metadata JSON needs semantic equality, not byte-identical serialization.
- Completion time, browser identity, and other diagnostic fields are excluded from deterministic comparisons.
- Source, profile, settings, algorithms, seed, and `.scr` use SHA-256 identifiers.
- Any pseudo-random operation uses a stored seed and one versioned generator.
- Dithering amount uses the exact rational value `integer_percent / 100`; precision and rounding are frozen in `RC-DES-001`.

## 4. Required specification adjustments

Update the SRS before freezing implementation acceptance:

1. Remove `Maximum` and all associated workflow and metadata references.
2. State that v1.0 project saving is available only for a completed `High` result.
3. Remove v1.0 project migration and preserved-result migration requirements.
4. Replace byte-identical metadata with semantic equality of deterministic fields.
5. Limit color input to untagged sRGB and explicitly recognized sRGB; reject other ICC profiles.
6. Replace the general WCAG target with the enumerated normative accessibility requirements.
7. Remove controlled update activation and rollback; document normal browser/PWA update behavior.
8. Add the approved dithering method, amount, switching, and invalid-input requirements.
9. Specify that a 0% enabled dithering method produces the same `.scr`, attributes, converted pixels, and quality values as `No dithering`; metadata may preserve the selected method.

These changes should create the next SRS revision before requirements-to-test traceability is frozen.

## 5. Phased implementation

### Phase 0 — Freeze the executable baseline

#### Deliverables

- Revised and approved implementation-scope SRS
- Initial `RC-DES-001` pipeline specification
- Profile, metadata, and completed-project schemas
- Stable error-code catalog
- Supported browser/OS matrix
- Reference hardware and viewport definition
- Initial conformance and golden-fixture strategy

#### Required decisions

- Exact recognized sRGB markers/profiles
- Adjustment ranges, defaults, and operation ordering
- Resampling definitions and edge rules
- ZX palette values and comparison color space
- Exact 2×1 checkerboard, Bayer 2×2, Bayer 4×4, and Bayer 8×8 thresholds, normalization, orientation, and origin
- Error-diffusion kernel and traversal order
- Fixed-point or explicitly rounded numeric representations
- `Draft` search reduction versus exhaustive `High` behavior
- Quality metric used for optimizer decisions and regression reporting

#### Exit gate

No conversion-core implementation begins until a source pixel can be traced through every versioned pipeline stage to a deterministic ZX output decision.

### Phase 1 — Repository and quality foundation

#### Work

- Create the workspace structure and web application shell.
- Enable strict TypeScript and prohibit implicit numeric or schema coercion.
- Add unit, integration, browser, schema, and accessibility test runners.
- Add lint, formatting, dependency pinning, license inventory, and CI.
- Add deterministic fixture loading and binary comparison utilities.
- Implement stable result/error types and operation identifiers.
- Add release-evidence output directories and traceability format.

#### Exit gate

- Clean checkout installs and builds reproducibly.
- CI runs unit tests, schema validation, and a browser smoke test.
- A fixture can be hashed, passed to a worker, and returned without mutation.

### Phase 2 — Safe deterministic import

#### Work

- Implement content-based PNG/JPEG identification.
- Integrate pinned, versioned non-canvas decoders.
- Support required static PNG color types and baseline/progressive grayscale/RGB JPEG.
- Reject animation, multipage content, CMYK JPEG, malformed input, and unsupported ICC data.
- Apply size, dimension, pixel-count, metadata, and allocation limits before unsafe work.
- Apply EXIF orientation.
- Convert supported sources into the controlled 8-bit sRGB working representation.
- Composite transparency using the selected background and frozen rounding.
- Make import atomic so failure preserves the open source and completed result.

#### Tests

- Valid and boundary PNG/JPEG corpus
- Truncated and malformed files
- Extension/content mismatches
- Oversized headers and allocation attacks
- EXIF orientation fixtures
- Alpha endpoint and rounding fixtures
- Untagged/recognized-sRGB acceptance and other-ICC rejection

#### Exit gate

Every supported input fixture produces identical normalized source pixels across the supported browser matrix.

### Phase 3 — Deterministic geometry and adjustments

#### Work

- Implement `Fit`, `Fill`, `Crop`, and `Stretch`.
- Store Crop X, Y, Width, and Height exclusively as oriented source pixels.
- Implement free, source-ratio, and destination-ratio crop policies.
- Synchronize pointer crop selection, bounded pointer and one-pixel keyboard
  repositioning, and double-click selection clearing with direct numeric entry.
- Implement rotation and horizontal/vertical mirror.
- Implement nearest-neighbor, bilinear, and Lanczos resampling.
- Implement brightness, contrast, saturation, and gamma in the frozen order.
- Implement smoothing and sharpening before color adjustments with frozen kernels,
  edge handling, integer blending, and clipping.
- Serialize every effective setting without loss.
- Add undo/redo for edit and conversion settings.
- Trigger immutable `Draft` requests after valid relevant changes.

#### Tests

- Geometry coordinate and edge fixtures
- Crop reopen/round-trip tests
- Crop pointer mapping, manual entry, bounded move/create gestures, one-pixel
  Arrow-key movement, double-click clear/reselection, and aspect-lock tests
- Resampling golden pixel buffers
- Adjustment range and rounding tests
- Smoothing/sharpening neutral, endpoint, edge-clamp, ordering, and persistence tests
- Dither-independent attribute-pair and ordered-gradient boundary regression tests
- Complementary-pair suppression and cross-attribute diffusion continuity tests
- Scale-aware bilinear/Lanczos constant-color, interpolation, and high-frequency
  minification tests
- Undo/redo and stale-result tests

#### Exit gate

The normalized 256×192 working image is deterministic and reproducible from serialized settings.

### Phase 4 — ZX Spectrum conversion core

#### Work

- Implement 32 columns of 8×8, 8×4, 8×2, or 8×1 cells.
- Implement canonical ZX palette and color-code representation.
- Enumerate enabled-palette `INK`, `PAPER`, and shared `BRIGHT` candidates under Auto/On/Off with `FLASH = 0`.
- Select a binary ink/paper value for all 64 pixels in each cell.
- Canonicalize visually equivalent black/bright-black encodings.
- Implement deterministic cell scoring.
- Implement bounded `Draft` and exhaustive or otherwise frozen `High` search.
- Construct the 6,144-byte interleaved bitmap and the selected mode's 768/1,536/3,072/6,144-byte row-major attribute section.
- Implement an independent `.scr` validator.

#### Tests

- Address transformation for every scanline region
- Bit-order and cell-address tests
- All attribute bit combinations permitted by v1.0
- Flash-bit rejection
- Canonical-black tests
- Independent golden `.scr` fixtures
- Serializer/validator disagreement tests

#### Exit gate

The core produces bit-identical, independently validated 6,912/7,680/9,216/12,288-byte `.scr` files across the supported matrix.

### Phase 5 — Dithering and quality behavior

#### Work

- Add method selector: `No dithering`, `Ordered`, `Error diffusion`.
- When `Ordered` is selected, add a matrix selector containing `2×1 Checkerboard`, `2×2`, `4×4`, and `8×8`.
- Define `2×1 Checkerboard` as the repeating `[0, 1]` horizontal pair with its phase reversed on every successive row.
- Add one shared integer `Dithering amount` field from 0 through 100.
- Switching between enabled methods retains the valid amount.
- Selecting `No dithering` uses effective 0%; enabling a method uses the retained value or 100% default.
- Invalid input receives red error styling plus programmatically associated `Invalid value` text.
- Invalid input does not start conversion; the last valid value stays effective.
- Ordered dithering scales threshold displacement by `amount / 100`.
- Matrix selection is a deterministic conversion setting and serializes into presets, metadata, and completed-final projects.
- Error diffusion scales propagated quantization error by `amount / 100` before the diffusion kernel.
- Apply dithering during candidate cell evaluation rather than after optimization.
- Prevent automatic optimization from changing the user-selected amount.
- Define and implement a deterministic quality score and reporting fields.

#### Tests

- Every integer endpoint and representative intermediate amounts
- Negative, empty, decimal, non-numeric, and greater-than-100 inputs
- Keyboard, pointer, and direct-entry behavior
- 0% equality with `No dithering` for `.scr`, attributes, pixels, and metrics
- 100% full-method golden outputs
- Golden outputs for all four ordered matrices, including checkerboard phase and matrix-origin tests
- Method switching and preset/project serialization
- Proof that no output pixel escapes its cell's ink/paper pair

#### Exit gate

All dithering modes are deterministic, constraint-valid, accessible, and covered by golden fixtures.

### Phase 6 — Worker jobs and product workflow

#### Work

- Implement immutable job requests with unique IDs.
- Add draft debouncing, final `High` command, cancellation, and stale-result suppression.
- Keep the last completed final result available while later jobs run.
- Detect worker crashes and invalid responses.
- Preserve source, settings, undo history, and last final result on worker failure.
- Provide manual retry only.
- Implement result states: current, stale, draft, running, cancelled, failed, and completed-final.
- Add progress and accessible announcements.

#### Exit gate

No cancelled, superseded, failed, draft, partial, or stale result can replace or be exported as the current completed result.

### Phase 7 — Preview, metadata, export, and final projects

#### Work

- Implement exact pixel preview and separately calibrated display preview.
- Add nearest-neighbor scaling, border, zoom, pan, before/after, pixel grid, and attribute grid as capacity permits.
- Implement `.scr` validation immediately before export.
- Export `.scr`, preview PNG, and metadata through explicit user actions.
- Define the deterministic metadata projection and informational fields.
- Implement sanitized deterministic suggested filenames.
- Implement completed-final `.rccproject` ZIP container only.
- Include original source, profile snapshot, settings, algorithms, seed, `.scr`, preview, metadata, manifest, and hashes.
- Reject unsafe, undeclared, duplicate, encrypted, linked, or over-limit entries atomically.
- Do not implement incomplete project saving or migration in v1.0.

#### Exit gate

A completed project round-trips on the same application version and reproduces identical `.scr` bytes and semantically equal deterministic metadata.

### Phase 8 — Profiles, presets, privacy, and offline operation

#### Work

- Implement schema-validated declarative profiles with no code or external references.
- Pin profile identity, semantic version, schema version, and content hash.
- Protect built-in profiles from shadowing.
- Implement complete versioned presets including dithering method and amount.
- Restrict persistent storage to preferences, profiles, presets, and offline resources.
- Provide retained-data review and deletion.
- Verify that no source, project, result, diagnostic, or usage data is uploaded.
- Add an offline application shell and test the core workflow after the initial successful load.
- Use normal browser/PWA update behavior; do not promise controlled activation or rollback.

#### Exit gate

The core workflow works offline and network-isolation tests show no application-data transmission.

### Feature milestone 11 — Ordered correction and Error-diffusion randomization

#### Problem statement

Error diffusion can settle into repeating limit cycles in large low-detail areas.
The supplied `agony-03-2.rccproject` also exposed diagonal bands in Ordered
Bayer 4×4 at 35%. Verification showed that the Bayer tables and orientation
already matched OsgDither exactly; the defect was independent per-channel
thresholding rather than OsgDither's palette-pair plus coverage-level search.
Ordered dithering must be corrected, not masked with noise.

The reference OsgDither implementation optionally seeds Java `Random` with `1`
and injects a small positive random value into each RGB error channel. This
breaks some error-diffusion cycles, but the one-sided `0..level` injection can
bias tone and color. Retro Converter will retain the useful decorrelation while
using a frozen, zero-mean deterministic sequence.

#### User-visible behavior

- Add one `Error randomization` integer control from 0% through 100% in the
  Dithering group, visible only for Error diffusion.
- Default is 0%, which must reproduce prior Error-diffusion outputs byte-for-byte.
- Method switching retains the value.
- The value and the frozen sequence identifier/seed are persisted in presets,
  profiles, metadata, and completed projects.
- The first implementation uses a fixed seed of `1`; no seed control is exposed
  until there is a demonstrated product need for multiple textures.

#### Error-diffusion behavior

- Use a counter-based deterministic generator keyed by algorithm version, seed,
  pixel coordinates, and RGB channel. It must not depend on worker scheduling or
  mutable generator call order.
- Generate signed, zero-mean perturbations and apply them to the unrestricted
  full-palette guide before quantization. The frozen maximum magnitude at 100%
  is 8 sRGB channel units.
- Propagate the resulting quantization error normally, so average tone is
  conserved rather than receiving OsgDither's positive-only bias.
- Attribute smoothing and halo selection continue to operate on the resulting
  guide and do not reset the noise sequence at attribute boundaries.

#### Correct Ordered-dither behavior

- Retain the exact OsgDither checkerboard/Bayer tables, orientation and
  whole-screen origin, represented internally as zero-based ranks.
- For every unrestricted guide pixel, search enabled palette endpoint pairs and
  the matrix's discrete coverage levels using OsgDither's integer level table.
- Emit the first or second endpoint according to the selected pattern rank and
  coverage. Do not threshold R, G and B independently.
- Apply no random noise, threshold jitter, blue-noise blend, or phase scrambling
  to Ordered dithering.
- Preserve Retro Converter's required 0%-equals-No-dithering bypass even though
  the historical OsgDither level table has different 0% behavior.

#### Completed numeric calibration

- Error-randomization settings 25%, 50%, and 100% correspond to maximum
  perturbations of 2, 4, and 8 channel units.
- Use the supplied Agony project plus flat ramps, skies, skin tones, dark
  gradients, and prior cityscape/character regression images.
- Flat-field calibration confirmed bounded coverage drift at all three values;
  the user-selectable range is retained because different images need different
  amounts of cycle breaking.
- The amplitude, generator, rounding, seed, and algorithm version are frozen in
  `RC-DES-001`.

#### Tests and acceptance gates

- Error randomization 0% is byte-identical to the previous Error-diffusion
  `.scr`, attributes, pixels, score, and preview.
- Repeated Draft and High conversions and the supported browser matrix produce
  bit-identical results at every representative suppression value.
- Flat-field and gradient fixtures show no statistically significant signed RGB
  bias relative to the same color coverage at 0%.
- Error-diffusion limit-cycle fixtures reduce repeated neighborhood frequency
  without increasing render score by more than the corpus-approved tolerance.
- The supplied Agony region loses the prominent diagonal banding through correct
  pair/coverage pattern dithering, without any Ordered noise or new 8×8 boundaries.
- Palette, BRIGHT, attribute-height, halo, project/profile round-trip, and
  rapid-preview-cancellation tests all continue to pass.
- Every exported result remains independently valid and every pixel remains one
  of its attribute's INK/PAPER colors.

#### Exit gate

The feature exits Milestone 11 only after the numeric design is frozen, the
supplied example passes visual review, correct Osg pattern behavior is proven,
and Error-randomization 0% compatibility is proven. Phase 9 begins only after
this and any later approved feature milestones are complete.

### Feature milestone 14 — Reference halo v2 and low-resolution dither laboratory

#### Goals

- Keep `zx-guide-reference-halo-v1` unchanged as the current production-quality
  reference and regression baseline.
- Add a stronger, separately versioned Halo v2 without changing the unrestricted
  guide topology that makes Halo v1 visually successful.
- Expand Ordered/pattern and Error-diffusion choices selectively. New algorithms
  must add a useful low-resolution behavior, not merely another named kernel.
- Use benchmark evidence and visual corpus review to decide which candidates are
  promoted to the normal engine selector.

#### Halo v2 contract

- Add immutable optimizer ID `zx-guide-reference-halo-v2`.
- Retain the Halo v1 pipeline order:
  1. create the unrestricted no-dither, Ordered, or Error-diffusion palette guide;
  2. select one legal INK/PAPER pair per attribute;
  3. remap excluded guide colors while preserving the guide's spatial pattern.
- Do not copy the Structured-v4 cell-pattern objective into Halo v2. Halo v2 must
  preserve the successful unrestricted dither topology and only improve attribute
  pair selection.
- Replace the ambiguous `Attribute smoothing` label with `Halo influence` when
  Halo v2 is selected. Store a new versioned `attributeHaloInfluence` value from
  0% through 400%:
  - 0% ignores neighboring attributes;
  - 100% is numerically equivalent to Halo v1 at the same radii;
  - 137% is the visually approved ZX production baseline;
  - 200% is the optional strong preset and makes compatible neighboring evidence
    approximately comparable with the evidence inside an 8×8 cell;
  - 300% and 400% are available for difficult gradients, but are not defaults.
- Keep horizontal and vertical radii independently selectable at 0, 1, or 2
  pixels. As before, vertical radius is forced to zero for 8×1 and 8×2 modes.
- Accumulate left, right, top, and bottom rings explicitly. Count corner pixels
  once, preserve the existing harmonic distance falloff, and normalize ring
  mass so increasing radius extends reach instead of accidentally multiplying
  an edge's total influence.
- Preserve edge protection. Weight neighboring guide samples by palette-color
  similarity and attenuate them across a strong adjusted-source luminance or
  chroma discontinuity. Freeze the similarity space, thresholds, fixed-point
  rounding, and tie breaks in `RC-DES-001`.
- Cap total halo evidence per cell to a documented multiple of the in-cell
  evidence. The initial calibration cap is 1.5× the cell mass, preventing a
  strong halo from erasing a real local feature while still allowing it to
  smooth an otherwise ambiguous pair transition.
- Keep Draft and High deterministic. High may evaluate both BRIGHT planes, but
  neither mode may change the guide or matrix phase.

#### Halo v2 calibration

- Evaluate influence values 0, 100, 150, 200, 300, and 400% with every attribute
  height and halo-radius combination.
- Use the cityscape red/yellow sky, Agony cloud/sea gradients, the eye, the QL
  bridge, skin tones, dark gradients, single-pixel details, high-contrast text,
  and synthetic flat ramps and edge fixtures.
- Compare Halo v2 directly with Halo v1 using:
  - final-preview squared RGB error;
  - low-frequency color/tone error;
  - edge retention and one-pixel feature survival;
  - attribute-boundary discontinuity;
  - palette/BRIGHT stability between adjacent cells;
  - visual review at Fit and pixel 1:1.
- The production Halo v2 preset is selected from corpus results rather than
  assuming that the strongest setting is best. Halo v1 remains available even
  if v2 is promoted.

#### Low-resolution dither candidate policy

- Add an `Experimental engines` option to `Compare engines`. Experimental
  candidates have immutable IDs, metadata, golden tests, and deterministic
  output, but are hidden from the normal engine selector until promoted.
- A candidate must offer a materially different useful behavior on 256×192,
  256×256, or 512×256 output. Reject candidates that only rename coefficients,
  increase matrix size without visible benefit, or duplicate an existing
  engine's quality/texture tradeoff.
- Benchmark candidates first on unrestricted palette output, then with Halo v1
  and Halo v2. This separates dither quality from attribute-pair quality.
- Promotion requires a documented niche or a corpus improvement. At most two
  new engines per family are promoted in this milestone; unsuccessful engines
  remain benchmark-only and are clearly marked experimental.

#### Ordered and pattern candidates

Evaluate these candidates in addition to the existing Osg/Bayer engines:

1. **Clustered-dot ordered v1**, using frozen 4×4 and 8×8 threshold maps.
   It deliberately groups pixels, which can make broad low-resolution gradients
   and CRT/TV viewing more stable, but may lose fine detail. It is promoted only
   if that texture is useful on the corpus.
2. **Void-and-cluster threshold v1**, using one frozen, isotropic 8×8 threshold
   map. This is deterministic pattern dithering, not random noise added to Bayer.
   It is intended to reduce Bayer's diagonal emphasis while retaining exact
   coverage counts and a bounded spatial period.

Do not add Bayer noise, phase jitter, per-cell matrix origins, or arbitrary
matrix rotations. All pattern engines use a whole-screen origin, exact threshold
coverage, and 0% byte identity with No dithering. A 16×16 pattern is considered
only if the 8×8 candidate demonstrably cannot represent the required tones
without visible low-resolution artifacts.

#### Error-diffusion candidates

Evaluate these candidates in addition to the historical Floyd–Steinberg and
current decorrelated Stucki engines:

1. **Atkinson serpentine v1** as a deliberately crisp, short-range,
   low-resolution option. Its under-diffusion and resulting tone loss must be
   measured explicitly; it is not treated as a general replacement.
2. **Riemersma/Hilbert diffusion v1** as a directionally different candidate for
   removing scanline worms and vertical columns. Freeze traversal, queue length,
   weights, edge handling, and color-error arithmetic before corpus comparison.

Do not add Jarvis–Judice–Ninke, Burkes, Sierra, and Sierra Lite simultaneously.
They are coefficient variants in the same scanline family and would inflate the
selector before showing a distinct product benefit. If Stucki fails a documented
case, benchmark one of these kernels internally and version it only when it
outperforms Stucki or establishes a clearly sharper/smoother niche.

#### Constrained block-level spatial optimizer

The proposed legal-mask Direct Binary Search is feasible, but it is not Halo
v2. Halo v2 deliberately preserves the unrestricted guide and improves only
attribute-pair selection. This proposal is a new coupled optimizer/dither family
that may change attribute pairs and output masks together. Implement it initially
as an Experimental benchmark engine, provisionally:

- attribute optimizer `zx-block-dbs-global-v1`;
- dither engine `pattern-legal-mask-dbs-v1`.

The first implementation follows these constraints:

- Initialize from the completed Halo v2 result rather than a flat or random
  screen. A candidate must improve the objective from that strong baseline;
  failure to improve returns the unchanged Halo v2 image.
- Treat legal 2×2 masks as the normal atomic pixel-pattern moves. For 8×1
  attributes use legal 2×1 moves; no move may straddle an attribute boundary or
  reinterpret pixels using a neighboring attribute's pair.
- Represent each mask as a small variable-area/shape cluster. Precompute its
  area, centroid, connectedness, perimeter/compactness, principal orientation,
  and edge adjacency. Equivalent rotations/reflections remain distinct only
  where their screen-space placement changes the objective.
- Provide two deterministic move classes:
  1. replace a local mask while retaining the cell's legal INK/PAPER pair;
  2. replace an attribute pair and re-optimize the affected cell's masks.
- Evaluate pair changes atomically across the complete 8×`h` attribute. Never
  leave pixels temporarily invalid, combine BRIGHT planes, or emit a color that
  is not the selected pair.
- Optimize iteratively rather than with a single left-to-right scan. Use
  deterministic checkerboard/red-black block sets, alternate X and Y traversal,
  and perform forward and reverse sweeps. Draft uses a small fixed pass budget;
  High stops after a frozen maximum pass count or a full pass with no accepted
  improvement.
- Keep all arithmetic fixed-point/integer with stable candidate order and tie
  breaks. Parallel workers may evaluate non-overlapping proposals, but commit
  order must be deterministic.

Use the following versioned objective:

```text
E = wr·E2D + wu·Euniformity + wc·Ecluster
  + wb·Eblue-noise + we·Eedge + wa·Eattribute
```

with these operational definitions:

- `E2D`: source-versus-rendered residual after the same symmetric separable 2D
  low-pass filter is applied to both. The filter has equal X/Y support and
  mirror-symmetric coefficients so it cannot create scan-direction preference.
- `Euniformity`: local variation in distance to the nearest compatible cluster
  centroid, evaluated within a bounded neighborhood. It penalizes uneven gaps
  without demanding a rigid lattice.
- `Ecluster`: tone-conditioned penalty for disconnected, elongated, oversized,
  or undersized clusters using the precomputed mask descriptors. Desired area
  and spacing may change with local tone, following bounded AM/FM or
  green-noise principles.
- `Eblue-noise`: low-frequency residual texture energy measured with a frozen
  local filter bank or autocorrelation stencil. Do not use a runtime FFT or
  nondeterministic spectral library. This term suppresses clumping and long
  directional patterns; it does not inject noise.
- `Eedge`: mismatch in filtered gradient magnitude and orientation between the
  adjusted source and rendered output. It protects real silhouettes and
  one-pixel structure from being shifted merely to improve texture statistics.
- `Eattribute`: rendered discontinuity across an attribute boundary after
  subtracting the corresponding source discontinuity, plus a smaller penalty
  for unnecessary pair changes. It must score visible output colors, not raw ZX
  palette-code distance.

All terms are evaluated locally for a mask move. A pair change invalidates and
recomputes the affected cell plus the fixed filter/regularizer halo around it.
Maintain cached residual, gradient, cluster-distance, and boundary terms so a
High conversion remains bounded; do not recompute the full-screen objective for
every proposal.

AM/FM and green-noise ideas are regularizers, not separate public dither
methods. They may adjust the preferred legal-cluster area and spacing according
to local tone, but:

- their ranges are frozen and bounded;
- the result remains composed only of legal masks and legal attribute pairs;
- they cannot move the pattern origin randomly;
- they cannot override the reconstruction and edge terms;
- they receive a new engine ID if their numeric behavior changes.

Before tuning weights, first prove isolated fixtures for each objective term.
Then use a small documented grid of weight sets rather than unconstrained manual
tuning. Promote the family only if it improves at least one difficult class
(smooth gradients, directional-pattern suppression, or attribute-boundary
continuity) without materially regressing Halo v2 edge and color fidelity.

#### Benchmark measurements

- Rank remains based on the common final-preview error, but expose additional
  low-resolution diagnostics instead of reducing quality to one number:
  - unrestricted-guide and final constrained RGB error;
  - 8×8 low-pass tone error;
  - edge loss/false-edge count;
  - horizontal, vertical, and diagonal run-length anisotropy;
  - repeated-neighborhood frequency and dominant spatial period;
  - attribute-boundary discontinuity;
  - execution time as informational only.
- Add filters for platform, optimizer, dither family, matrix/kernel, and
  experimental/promoted status.
- Preserve benchmark results when applying a row, and allow side-by-side or
  rapid A/B inspection of Halo v1, Halo v2, and the unrestricted guide.
- Never auto-select the numeric winner. Visual inspection remains authoritative,
  especially where a crisp low-resolution texture intentionally trades score
  for readability.

#### Persistence and public interfaces

- Add `zx-guide-reference-halo-v2` to engine descriptors, profiles, presets,
  projects, metadata, and benchmark rows.
- Add the versioned Halo v2 influence and edge-weight model identifiers to
  conversion settings. Halo v1 continues to interpret its existing settings
  exactly as before.
- Add engine lifecycle metadata: `experimental`, `promoted`, or `legacy`.
  Normal selectors show promoted and legacy engines; Compare engines may opt
  into experimental engines.
- Corrections create new engine IDs. No released Halo, pattern, or diffusion
  implementation is modified in place.

#### Tests and acceptance gates

- Golden tests prove Halo v1 is byte-identical before and after this milestone.
- Halo v2 at 0% influence equals Halo v1 at 0% for attributes, pixels, score,
  and preview.
- Halo v2 at 100% matches the documented v1-equivalent halo weighting before
  v2-only normalization and edge protection are enabled in isolated unit tests.
- Increasing influence changes ambiguous gradient boundaries monotonically in
  targeted fixtures, while strong-edge fixtures retain their local pairs.
- Radius and corner tests prove normalized ring mass, no double-counted corners,
  screen-edge clipping, and disabled vertical halo for 8×1/8×2.
- Every candidate is deterministic across Draft/High, worker scheduling, and
  supported browsers; every ZX output remains attribute-valid.
- Pattern tests freeze threshold maps, origin, coverage at every matrix level,
  and prove absence of injected noise.
- Diffusion tests measure flat-field bias, edge behavior, cycle frequency,
  directional anisotropy, and deterministic traversal.
- Block-DBS tests prove every intermediate accepted state is hardware-valid,
  objective deltas equal full recomputation, traversal reversal does not create
  a systematic X/Y bias, and every reported High result is no worse than its
  Halo v2 initialization under the frozen objective.
- Project/profile/metadata round trips retain exact optimizer, dither, influence,
  matrix/kernel, experimental status, and benchmark identity.

#### Exit gate

- Halo v2 has a corpus-selected default influence and is visually approved
  against Halo v1 on the known regression images.
- Halo v1 remains selectable and byte-identical.
- No more than two Ordered/pattern and two Error-diffusion candidates are
  promoted, and every promoted method has a documented low-resolution use case.
- The block-level DBS family either demonstrates a documented advantage over
  Halo v2 within its performance budget or remains Experimental/benchmark-only.
- Benchmark-only candidates do not clutter the normal conversion workflow.
- Numeric definitions and acceptance thresholds are frozen in `RC-DES-001`
  before final Phase 9 release hardening begins.

### Final Phase 9 — Accessibility, compatibility, and release hardening

This phase is deliberately last. Do not begin the final browser/OS matrix,
fuzzing campaign, corpus approval, or release reports while feature behavior or
versioned conversion algorithms are still changing.

#### Work

- Complete the enumerated keyboard, focus, names/roles/states, contrast, reduced-motion, zoom, error, and progress requirements.
- Run automated and manual keyboard and screen-reader checks.
- Execute the frozen browser/OS compatibility matrix.
- Run parser fuzzing, archive traversal, decompression-bomb, malformed-input, and resource-exhaustion suites.
- Freeze conformance and quality corpora.
- Generate independent golden artifacts.
- Complete requirements-to-test traceability.
- Produce compatibility, determinism, accessibility, security, privacy, offline, quality, and known-risk reports.

#### Exit gate

Every retained v1.0 `MUST` requirement passes or has an explicit approved waiver in the release-evidence package.

## 6. Suggested implementation increments

Each increment should remain demonstrable and releasable to internal testers:

1. **Binary proof:** hard-coded 256×192 pixels serialize to a valid `.scr`.
2. **Deterministic import:** one PNG fixture converts identically in the worker across browsers.
3. **Automatic standard conversion:** imported image produces optimized cell attributes and `.scr`.
4. **Controlled editing:** framing, adjustment, and resampling settings reproduce results.
5. **Dithering:** method and amount produce constraint-valid deterministic outputs.
6. **Transactional UI:** draft/final jobs, cancellation, progress, failure, and stale suppression work.
7. **Artifact workflow:** previews, metadata, `.scr`, and completed-final projects round-trip.
8. **Release candidate:** offline, accessibility, compatibility, security, and evidence gates pass.

## 7. Critical dependency order

```text
SRS revision
  -> RC-DES-001 numeric and pipeline rules
    -> codec and normalized-pixel proof
      -> geometry/adjustment goldens
        -> ZX serializer and validator
          -> optimizer and dithering
            -> worker lifecycle
              -> UI and export
                -> projects/profiles/offline
                  -> release evidence
```

Do not build the complete UI before normalized pixels, `.scr` serialization, and deterministic cell optimization have passing golden tests.

## 8. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| PNG/JPEG decoder behavior differs across engines | Breaks determinism | Use one pinned non-canvas decoder path and cross-browser pixel goldens early |
| Floating-point or rounding drift | Different `.scr` output | Freeze operation order and rounding; prefer bounded integer/fixed-point representations |
| Cell optimizer is too slow | Poor workflow | Benchmark in Phase 4; keep bounded `Draft`; profile worker hotspots before UI expansion |
| Dithering interacts unpredictably with cell selection | Quality or correctness defects | Evaluate dithering inside each candidate and retain strict cell validation |
| Project format expands v1 scope | Delays core product | Save completed-final projects only; no migration or incomplete saves |
| Offline/update behavior varies by browser | Compatibility failures | Promise offline workflow only; use standard update behavior without rollback guarantees |
| 187+ blocking requirements overwhelm release | Schedule risk | Revise SRS to remove deferred requirements and assign an owner/test to every retained MUST |
| Quality metric rewards undesirable artifacts | Bad automatic output | Maintain diverse quality corpus and manual review; version metric and thresholds |

## 9. Staffing and indicative sequence

For one experienced engineer, expect approximately 14–18 focused weeks after Phase 0 decisions, with release hardening and corpus construction accounting for a significant portion. Two engineers can parallelize UI/workflow and deterministic-core/test work after the Phase 2 normalized-pixel contract is stable, but should not implement competing numeric pipelines.

Suggested ownership:

- Conversion/core owner: codecs, normalization, optimizer, dithering, `.scr`, determinism
- Product/UI owner: workflow, state, worker orchestration, preview, accessibility, offline shell
- Verification responsibility: schemas, corpora, browser matrix, security, goldens, traceability

## 10. Definition of done for v1.0

v1.0 is done only when:

- Supported PNG/JPEG input is safely and deterministically normalized.
- `Draft` and `High` terminate under defined bounds.
- Every output satisfies its selected 8×`h` attribute constraints and `FLASH = 0`.
- Dithering 0% equals no dithering for normative output and metrics.
- `.scr` output has the exact selected software-mode size and is independently validated.
- Cross-platform golden comparisons pass for `.scr` and decoded pixels.
- Draft, stale, cancelled, partial, and failed results cannot be exported.
- Explicit export and completed-final project round-trip succeed.
- No source or project data leaves the device.
- The core workflow works offline after initial load.
- Retained accessibility requirements pass their automated/manual checks.
- Security, malformed-input, compatibility, and release-evidence gates pass.
- All remaining MUST requirements pass or have approved documented waivers.
