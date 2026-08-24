# Retro Converter

## Software Requirements Specification

| Document field | Value |
|---|---|
| Document ID | `RC-SRS-001` |
| Product | Retro Converter |
| Target release | v1.0 |
| Document version | 1.0-draft.3 |
| Status | Draft for review |
| Owner | TBD |
| Author | TBD |
| Approvers | TBD |
| Approval date | TBD |
| Last updated | 2026-07-22 |

### Revision history

| Version | Date | Author | Summary | Approval |
|---|---|---|---|---|
| 0.2 | 2026-07-20 | TBD | Original concept and architecture draft | Not approved |
| 1.0-draft | 2026-07-22 | TBD | Rewritten as a normative, testable v1.0 implementation and acceptance baseline | Pending |
| 1.0-draft.1 | 2026-07-22 | TBD | Added user-selectable dithering amount from 0% to 100% with method-specific semantics | Pending |
| 1.0-draft.2 | 2026-07-22 | TBD | Resolved v1.0 blockers using the approved minimum implementation scope | Pending |
| 1.0-draft.3 | 2026-07-22 | TBD | Added ordered-dithering matrix selection for 2×1 checkerboard, 2×2, 4×4, and 8×8 matrices | Pending |
| 1.0-draft.3 amendment | 2026-07-23 | TBD | Added 8×8/8×4/8×2/8×1 software attribute modes, BRIGHT policy, and selectable ZX palette colors | Pending |

---

## 1. Document purpose and authority

This Software Requirements Specification (SRS) defines the normative product requirements and release-acceptance baseline for Retro Converter v1.0. It is intended for product, engineering, test, security, accessibility, and release-approval stakeholders.

Requirements use the keywords **MUST**, **SHOULD**, and **MAY**:

- **MUST** requirements are mandatory for v1.0 unless an explicit waiver is approved and recorded in the release-evidence package.
- **SHOULD** requirements are expected but do not independently block release when a justified deviation is recorded.
- **MAY** requirements describe permitted optional behavior.

If prose conflicts with a uniquely identified requirement, the identified requirement takes precedence. Appendices explicitly marked informative are non-normative and do not form part of v1.0 acceptance.

Detailed algorithm design, source-code structure, UI component design, exact quality-metric formulas, test fixtures, and golden files belong in controlled design or verification specifications unless explicitly made normative here.

## 2. Product definition

Retro Converter is a free, browser-based, local-processing application that converts modern static images into visually optimized graphics constrained by classic-computer display formats.

Retro Converter v1.0 targets one reference configuration:

- Machine family: Sinclair ZX Spectrum
- Hardware variant: ZX Spectrum 48K
- Timing context: PAL, nominally 50 Hz
- Display model: 256×192 bitmap with 32 columns of 8×8, 8×4, 8×2, or 8×1 attribute cells
- Rendering technique: one static frame; 8×8 is native standard mode and smaller cells are software modes
- Artifact: standard 6,912-byte `.scr` for 8×8 or the specified extended-attribute `.scr` for software modes

The v1.0 product is **visual-simulation-first**. It guarantees deterministic conversion and `.scr` format validity, but it does not claim that every preview reproduces a specific physical display or that exported files have been executed on physical hardware. Border color is preview and metadata information because it is not stored in a `.scr` file.

### 2.1 Product goals

- Favor conversion quality over elapsed conversion time.
- Make the main workflow approachable while exposing professional image-processing controls.
- Produce deterministic, reproducible, inspectable results.
- Keep source images and project data on the user's device.
- Work offline after a successful initial load.
- Establish safe extension points through declarative ZX-compatible profiles.
- Provide objective, repeatable evidence for release acceptance.

### 2.2 v1.0 non-goals

The following are outside the normative v1.0 scope:

- Video, animation, audio, multipage-image, and live-input conversion
- Other machines or ZX Spectrum display modes
- Runtime executable-code plugins
- Raster-timed register changes, copper lists, palette schedules, and player routines
- Temporal flicker, interlace, mixed-mode, FLI, IFLI, HAM, or equivalent techniques
- TAP, TZX, assembler, BASIC, compressed, sprite, tile, font, or emulator-package export
- Guaranteed execution on physical ZX Spectrum hardware
- Calibrated CRT emulation, scanlines, phosphor persistence, blur, bloom, or noise
- Mobile and touch-optimized interfaces
- Server processing, cloud project storage, telemetry, and automatic crash upload
- Guaranteed wall-clock conversion completion time
- Work-in-progress project files and implicit crash recovery
- Project migration between incompatible schema or application versions
- Controlled application-update activation and application-managed rollback
- Formal WCAG 2.2 AA conformance claims beyond the enumerated accessibility requirements in this SRS

## 3. Conceptual model

The product keeps the following concepts distinct:

| Concept | v1.0 definition |
|---|---|
| Machine family | ZX Spectrum |
| Hardware variant | 48K |
| Timing standard | PAL, used as descriptive display context only for the static v1.0 mode |
| Display mode | 256×192 bitmap plus 32×(192 / selected attribute height) attribute memory |
| Rendering technique | Standard static single-frame rendering |
| Profile | Versioned declarative presentation and optimization data compatible with the fixed built-in mode |
| Rendering result | Deterministic pixels, attributes, palette selections, settings, metrics, and validation state |
| Export artifact | Preview PNG, `.scr`, metadata JSON, project container, optional export bundle, or diagnostic report |

### 3.1 Output fidelity classification

The product taxonomy reserves three output-fidelity classes:

- `NATIVE_STATIC`: directly representable as native static display data.
- `HARDWARE_EXECUTABLE`: includes all schedules, code, or player contracts required for execution.
- `SIMULATION_ONLY`: visually modeled but not guaranteed executable on declared hardware.

Retro Converter v1.0 supports only `NATIVE_STATIC`. The existence of the taxonomy does not commit the product to the other classes in v1.0.

## 4. Users and primary workflow

The primary users are beginners seeking a strong automatic result and advanced users tuning framing, color, resampling, dithering, and optimization quality.

The guided professional workflow is:

1. Import a source image.
2. Select a compatible profile and optional preset.
3. Frame and adjust the image.
4. Inspect the automatically generated `Draft` preview.
5. Explicitly run a `High` conversion.
6. Inspect the pixel preview, display preview, quality information, warnings, and validation state.
7. Save a completed-final project or export artifacts.

The user may revisit earlier steps without losing the last completed final result.

## 5. Requirement record format

Each normative requirement has an identifier, priority, statement, verification method, acceptance reference, and target release. All requirements in this document target v1.0 unless stated otherwise.

Verification methods are:

- **T** — automated or manual test
- **I** — inspection of implementation, schema, or evidence
- **A** — analysis or deterministic comparison
- **D** — controlled demonstration

Acceptance references identify the minimum test or evidence class. Exact test-case identifiers may be expanded in the verification specification while preserving these references.

## 6. Input and source interpretation requirements

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-IMPORT-001` | MUST | The application shall import static PNG and JPEG images only. | T | `AT-IMPORT-FORMATS` |
| `FR-IMPORT-002` | MUST | The application shall determine the input type from validated file content and shall not trust the filename extension alone. | T | `AT-IMPORT-SNIFF` |
| `FR-IMPORT-003` | MUST | PNG support shall include non-animated standard PNG color types with 8-bit or 16-bit channels. | T | `AT-PNG-CONFORMANCE` |
| `FR-IMPORT-004` | MUST | JPEG support shall include baseline and progressive JPEG encoded as grayscale or RGB. | T | `AT-JPEG-CONFORMANCE` |
| `FR-IMPORT-005` | MUST | CMYK JPEG, APNG, animated content, embedded additional images, and multipage content shall be rejected with stable unsupported-format errors. | T | `AT-IMPORT-UNSUPPORTED` |
| `FR-IMPORT-006` | MUST | The application shall reject files larger than 50 MiB, images exceeding 8,192 pixels in either dimension, or images exceeding 32 megapixels after header validation and before unbounded allocation. | T/A | `AT-INPUT-LIMITS` |
| `FR-IMPORT-007` | MUST | EXIF orientation shall be applied before crop, framing, resampling, and other geometric transformations. | T | `AT-EXIF` |
| `FR-IMPORT-008` | MUST | A source without an embedded ICC profile shall be interpreted as sRGB. | T | `AT-COLOR-DEFAULT` |
| `FR-IMPORT-009` | MUST | A source containing an embedded ICC profile shall be accepted only when that profile is on the exact controlled sRGB allow-list defined in `RC-DES-001`; accepted profiles shall be interpreted deterministically as sRGB without general-purpose profile conversion. | T/A | `AT-ICC-CONVERSION` |
| `FR-IMPORT-010` | MUST | An embedded ICC profile that is malformed, excessive, unsafe, unsupported, or absent from the controlled sRGB allow-list shall cause atomic import rejection; it shall not be silently ignored or approximately converted. | T | `AT-ICC-REJECTION` |
| `FR-IMPORT-011` | MUST | Transparency shall be composited against the user-selected background color using versioned alpha and rounding rules before conversion. | T/A | `AT-ALPHA` |
| `FR-IMPORT-012` | MUST | Malformed, truncated, oversized, animated, multipage, or unsupported input shall be rejected atomically with a stable error code and readable explanation. | T | `AT-IMPORT-FAILURE` |
| `FR-IMPORT-013` | MUST | A failed import shall not replace the currently open source, project state, or last completed result. | T | `AT-IMPORT-ATOMICITY` |
| `FR-IMPORT-014` | MUST | The application shall not attempt partial conversion of damaged input. | T/I | `AT-IMPORT-ATOMICITY` |
| `FR-IMPORT-015` | SHOULD | The file chooser and drag-and-drop surface should communicate supported formats and public limits before import. | D | `AT-IMPORT-UX` |

## 7. Controlled and deterministic processing

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-DET-001` | MUST | Normative conversion shall use versioned built-in PNG and JPEG decoding and shall not depend on browser canvas decoding. | I/T | `AT-CROSS-PLATFORM` |
| `FR-DET-002` | MUST | Normative resampling, color conversion, alpha compositing, quantization, dithering, and optimization shall use versioned implementations with defined arithmetic, traversal, edge, and rounding behavior. | I/A | `AT-DETERMINISM` |
| `FR-DET-003` | MUST | Given identical source bytes, profile snapshot, settings, seed, optimization level, and application version, all supported browser/OS combinations shall produce bit-identical `.scr` bytes, selected cell attributes, palette decisions, decoded preview pixels, and quality measurements. Deterministic metadata fields shall be semantically equal after parsing; raw JSON byte equality is not required. | A | `AT-CROSS-PLATFORM` |
| `FR-DET-004` | MUST | Decoded preview pixels shall be identical across supported platforms; encoded preview PNG bytes may differ. | A | `AT-PREVIEW-DECODED` |
| `FR-DET-005` | MUST | Completion timestamps, environment-identification fields, JSON member order, insignificant JSON whitespace, and other schema-declared informational fields shall be excluded from comparisons that assert normative conversion determinism. | I/A | `AT-METADATA-DETERMINISM` |
| `FR-DET-006` | MUST | Every stochastic or pseudo-random operation shall use a stored explicit seed and a versioned generator. | I/T | `AT-SEED` |
| `FR-DET-007` | MUST | Conversion output shall not depend on worker scheduling, processor core count, locale, time zone, wall-clock time, or current date. | A | `AT-ENV-INDEPENDENCE` |
| `FR-DET-008` | MUST | The application shall record algorithm and pipeline component versions required to reproduce a result. | I/T | `AT-METADATA-CONTENT` |

## 8. Image framing and adjustment controls

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-EDIT-001` | MUST | The application shall provide `Fit`, `Fill`, `Crop`, and `Stretch` framing modes. | D/T | `AT-FRAMING` |
| `FR-EDIT-002` | MUST | `Fit` shall preserve source aspect ratio, include the complete oriented image within 256×192, and fill unused canvas pixels with the selected background color. | T | `AT-FIT` |
| `FR-EDIT-003` | MUST | `Fill` shall preserve aspect ratio, fill 256×192, and permit interactive selection of the crop focal position. | T/D | `AT-FILL` |
| `FR-EDIT-004` | MUST | `Stretch` shall resize directly to 256×192 without preserving source aspect ratio. | T | `AT-STRETCH` |
| `FR-EDIT-005` | MUST | Crop bounds shall be stored without loss as integer `X`, `Y`, `Width`, and `Height` coordinates in oriented source-image pixels. | I/A | `AT-CROP-REOPEN` |
| `FR-EDIT-006` | MUST | The application shall provide rotation and horizontal and vertical mirroring. | T | `AT-GEOMETRY` |
| `FR-EDIT-007` | MUST | The application shall provide brightness, contrast, saturation, and gamma controls with versioned ranges, defaults, ordering, and arithmetic. | T/I | `AT-ADJUSTMENTS` |
| `FR-EDIT-008` | MUST | The application shall provide nearest-neighbor, bilinear, and Lanczos resampling. | T/A | `AT-RESAMPLING` |
| `FR-EDIT-009` | MUST | The application shall provide a pop-down `Dithering method` control containing `No dithering`, `Ordered`, and `Error diffusion`. | T/D | `AT-DITHERING` |
| `FR-EDIT-010` | MUST | User-visible control values shall serialize without loss into projects and conversion metadata. | T | `AT-SETTING-ROUNDTRIP` |
| `FR-EDIT-011` | MUST | The application shall support undo and redo for framing, adjustments, profile selection, preset selection, and conversion settings. | T/D | `AT-UNDO` |
| `FR-EDIT-012` | MUST | Export, project save, profile installation, and profile removal shall not be added to the edit undo history. | T | `AT-UNDO-BOUNDARY` |
| `FR-EDIT-013` | MUST | Restoring a state through undo or redo shall request a new draft conversion and shall not relabel the prior final result as current. | T | `AT-UNDO-STALE` |
| `FR-EDIT-014` | MAY | Edit history may be cleared when another project or source is opened, provided the user is warned about unsaved changes. | T | `AT-HISTORY-CLEAR` |
| `FR-EDIT-015` | MUST | When `Ordered` or `Error diffusion` is selected, the application shall provide a user-visible `Dithering amount` field accepting every integer percentage from 0% through 100% inclusive. The field shall support pointer adjustment, keyboard adjustment, and direct numeric entry. | T/D | `AT-DITHER-AMOUNT-CONTROL` |
| `FR-EDIT-016` | MUST | When `Ordered` dithering is selected, the application shall provide a pop-down `Ordered matrix` control containing exactly `2×1 Checkerboard`, `2×2`, `4×4`, and `8×8`. | T/D | `AT-ORDERED-MATRIX-CONTROL` |
| `FR-EDIT-017` | MUST | The application shall provide an `Attribute size` pop-down containing exactly `8×8`, `8×4`, `8×2`, and `8×1`. | T/D | `AT-ATTRIBUTE-SIZE-CONTROL` |
| `FR-EDIT-018` | MUST | The application shall provide a `BRIGHT` pop-down containing `Auto`, `On`, and `Off`. `Auto` permits the optimizer to select the shared bit, `On` requires bit 6 in every attribute, and `Off` clears bit 6 in every attribute. | T/A | `AT-BRIGHT-CONTROL` |
| `FR-EDIT-019` | MUST | The application shall present exactly the eight ZX base color codes `0..7` as selectable controls and shall require at least one selection. These selections constrain both INK and PAPER codes; they shall not encode brightness independently. The single shared BRIGHT policy applies to the complete attribute. | T/D | `AT-PALETTE-CONTROL` |
| `FR-EDIT-020` | MUST | Crop shall provide `No aspect ratio`, `Lock aspect ratio as source image`, and `Lock aspect ratio as destination image` policies. | T/D | `AT-CROP-ASPECT` |
| `FR-EDIT-021` | MUST | Direct changes to crop Width or Height shall update the other dimension when an aspect-ratio lock is active and shall keep the rectangle within the oriented source bounds. | T/D | `AT-CROP-MANUAL` |
| `FR-EDIT-022` | MUST | In Crop mode the user shall be able to create the crop rectangle by pointer drag on the Source image. The manual X, Y, Width, and Height fields shall update during the selection. | T/D | `AT-CROP-POINTER` |
| `FR-EDIT-023` | MUST | Pointer crop selection shall maintain the active aspect-ratio policy, remain within the oriented source bounds, and request an updated Draft result. | T/D | `AT-CROP-POINTER` |
| `FR-EDIT-024` | MUST | A pointer drag starting inside the existing crop rectangle shall move that rectangle without changing its Width or Height and shall keep it within the oriented source bounds. A drag starting outside the rectangle shall create a new crop selection. | T/D | `AT-CROP-MOVE` |
| `FR-EDIT-025` | MUST | Double-clicking inside the active crop rectangle shall clear the editor selection without changing the stored crop coordinates or current converted result. After clearing, the next pointer drag shall create a new crop selection. | T/D | `AT-CROP-CLEAR` |
| `FR-EDIT-026` | MUST | While the crop editor has keyboard focus and a crop selection is active, each Arrow-key press shall move the rectangle by exactly one oriented source pixel in the corresponding direction without changing Width or Height. Movement shall clamp at the oriented source bounds. | T/D | `AT-CROP-KEYBOARD` |
| `FR-EDIT-027` | MUST | The application shall provide `Smoothing` and `Sharpening` controls accepting every integer percentage from 0% through 100% inclusive. Both shall default to 0%, support pointer, keyboard, and direct numeric entry, and be included in the adjustment reset action. | T/D | `AT-IMAGE-FILTER-CONTROLS` |
| `FR-EDIT-028` | MUST | Image filtering shall execute after resampling and before color adjustments in the fixed order smoothing, sharpening, brightness, contrast, saturation, then gamma. The arithmetic, edge behavior, ranges, and rounding shall be versioned in `RC-DES-001`. | T/I | `AT-IMAGE-FILTER-ORDER` |
| `FR-EDIT-029` | MUST | Lanczos minification shall widen its filter footprint according to the source-to-destination reduction ratio and shall low-pass high-frequency source detail before subsampling. Its scale arithmetic, support, normalization, separable passes, edge behavior, and rounding shall be versioned in `RC-DES-001`. | A/T | `AT-LANCZOS-MINIFICATION` |
| `FR-EDIT-030` | MUST | Bilinear minification shall widen its triangle-filter footprint according to the source-to-destination reduction ratio and shall low-pass high-frequency source detail before subsampling. Enlargement shall retain ordinary bilinear interpolation. Its scale arithmetic, support, normalization, separable passes, edge behavior, and rounding shall be versioned in `RC-DES-001`. | A/T | `AT-BILINEAR-MINIFICATION` |

## 9. Optimization and ZX Spectrum conversion semantics

### 9.1 Optimization levels

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-OPT-001` | MUST | The application shall expose the versioned optimization levels `Draft` and `High`. | T | `AT-QUALITY-LEVELS` |
| `FR-OPT-002` | MUST | Each level shall have a deterministic bounded iteration, evaluation, or search limit and shall terminate without relying on a wall-clock cutoff. | I/A | `AT-OPT-BOUNDS` |
| `FR-OPT-003` | MUST | `High` shall be the default final-conversion level. | T | `AT-QUALITY-DEFAULT` |
| `FR-OPT-004` | MUST | Relevant setting changes shall start a lightweight deterministic `Draft` conversion. | T | `AT-DRAFT-AUTO` |
| `FR-OPT-005` | MUST | The last completed final result shall remain available while a draft or later final conversion is running. | T | `AT-LAST-RESULT` |
| `FR-OPT-006` | MUST | The user shall explicitly start a `High` final conversion. | T/D | `AT-FINAL-EXPLICIT` |
| `FR-OPT-007` | MUST | Draft results shall be visibly labeled and shall not be exportable as `.scr` or saveable as completed final output. | T/D | `AT-DRAFT-GUARD` |
| `FR-OPT-008` | MUST | The optimizer shall select ink and paper for every selected attribute cell and shall select or enforce the shared brightness state according to the active BRIGHT policy and enabled palette colors. | A/T | `AT-ZX-CONSTRAINTS` |
| `FR-OPT-009` | MUST | Attribute-pair selection shall use the versioned continuous pair score before bitmap dithering and shall be independent of dithering method, matrix, and amount. For otherwise identical conversion inputs, changing only those dithering settings shall not change cell attributes. | A/T | `AT-OPT-DECOUPLED` |
| `FR-OPT-010` | MUST | The continuous pair score shall include a fixed versioned penalty for binary color-pair span variance so that widely separated or complementary colors are not selected solely because their continuous segment passes near the source color. | A/T | `AT-OPT-PAIR-SPAN` |

### 9.2 Authentic standard-mode constraints

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-ZX-001` | MUST | The active display shall contain exactly 256×192 binary pixel selections. | A | `AT-SCR-LAYOUT` |
| `FR-ZX-002` | MUST | The attribute grid shall contain exactly 32 columns and `192 / h` rows, where selected attribute height `h` is one of 8, 4, 2, or 1. Each cell controls one 8×`h` pixel region. | A | `AT-ZX-CELLS` |
| `FR-ZX-003` | MUST | Each cell shall contain one `INK` color, one `PAPER` color, one shared `BRIGHT` bit, and `FLASH = 0`. | A | `AT-ZX-ATTR` |
| `FR-ZX-004` | MUST | Every pixel in a cell shall select only that cell's ink or paper color. | A | `AT-ZX-PIXELS` |
| `FR-ZX-005` | MUST | The converter shall use a documented canonical encoding for visually equivalent black and bright-black alternatives to prevent byte differences without visual differences. | A/I | `AT-ZX-CANONICAL` |
| `FR-ZX-006` | MUST | The default built-in palette shall provide display-calibrated sRGB values for the eight base color codes in both normal and bright planes. The optimizer shall use only user-enabled base codes, and the one shared BRIGHT bit shall select the plane for both INK and PAPER. Mixing a normal and bright color in one attribute is forbidden. | I/T | `AT-ZX-PALETTE` |
| `FR-ZX-007` | MUST | `FLASH` shall not be user-configurable in v1.0. | T/I | `AT-FLASH-DISABLED` |
| `FR-ZX-008` | MUST | The conversion model shall support only the fixed attribute heights 8, 4, 2, and 1; arbitrary breakpoints, per-scanline register changes, and multiple frames remain outside v1.0. | I/T | `AT-V1-SCOPE` |

### 9.3 Dithering behavior

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-DITH-001` | MUST | Dithering may propagate error across source or destination pixels, but the completed result shall obey the selected ink/paper pair in every 8×`h` cell. | A | `AT-DITHER-CONSTRAINT` |
| `FR-DITH-002` | MUST | Each dithering implementation shall define traversal order, diffusion coefficients, edge handling, clipping, intermediate precision, and rounding. | I/A | `AT-DITHER-SPEC` |
| `FR-DITH-003` | MUST | Ordered dithering shall support the versioned matrix identifiers `checkerboard-2x1`, `bayer-2x2`, `bayer-4x4`, and `bayer-8x8`. Their exact integer thresholds, normalization, coordinate orientation, and origin shall be frozen in `RC-DES-001`. | I/A | `AT-ORDERED-DITHER` |
| `FR-DITH-004` | MUST | Error diffusion shall not produce an invalid intermediate artifact that can be exported as complete output. | T | `AT-PARTIAL-GUARD` |
| `FR-DITH-005` | MUST | For otherwise identical conversion inputs, a dithering amount of 0% shall produce exactly the same `.scr` bytes, cell attributes, converted pixels, and quality measurements as `No dithering`. Metadata may retain the selected method and zero amount for provenance. At 100%, the complete versioned method shall be applied. | A/T | `AT-DITHER-AMOUNT-ENDPOINTS` |
| `FR-DITH-006` | MUST | Let `a = amount_percent / 100`. For ordered dithering, each threshold displacement from the non-dithered decision threshold shall be multiplied by `a`. At 0%, displacement shall be zero; at 100%, the complete versioned threshold displacement shall be used. The method shall not blend final output colors or introduce colors outside the cell's selected ink/paper pair. | I/A | `AT-ORDERED-DITHER-AMOUNT` |
| `FR-DITH-007` | MUST | For error-diffusion dithering, quantization error shall be multiplied by `a = amount_percent / 100` before the versioned diffusion coefficients are applied. At 0%, no error shall be propagated; at 100%, the complete versioned error shall be propagated. | I/A | `AT-DIFFUSION-DITHER-AMOUNT` |
| `FR-DITH-008` | MUST | After the optimizer fixes each cell's ink, paper, and shared brightness state, the selected dithering method, matrix, and amount shall control only the bitmap decisions within that fixed pair. | I/A | `AT-OPT-DECOUPLED` |
| `FR-DITH-009` | MUST | The converter shall use the user-selected dithering amount as a conversion constraint and shall not silently replace it with a value that produces a better automated quality score. | T/A | `AT-DITHER-AMOUNT-RESPECTED` |
| `FR-DITH-010` | MUST | The built-in default amount for an enabled dithering method shall be 100%. A selected preset may define another default, provided the effective amount is shown to the user and serialized as a complete conversion setting. Selecting `No dithering` shall set the effective amount to 0%. | T/I | `AT-DITHER-AMOUNT-DEFAULT` |
| `FR-DITH-011` | MUST | Intermediate precision, multiplication order, clipping, and rounding for dithering-amount calculations shall be defined in `RC-DES-001` and applied deterministically. | I/A | `AT-DITHER-AMOUNT-ARITHMETIC` |
| `FR-DITH-012` | MUST | Switching between `Ordered` and `Error diffusion` shall retain the current valid dithering amount. Selecting `No dithering` shall make the effective amount 0%. Selecting an enabled method after `No dithering` shall use 100% unless the active preset or opened project supplies another valid amount. | T | `AT-DITHER-METHOD-SWITCH` |
| `FR-DITH-013` | MUST | Empty, non-numeric, non-integer, negative, and greater-than-100 dithering amounts shall be invalid. An invalid field shall use red error styling and display the text `Invalid value`, programmatically associated with the field. Invalid input shall not start a conversion, and the last valid effective amount shall remain active until the entry is corrected. | T/D | `AT-DITHER-AMOUNT-INVALID` |
| `FR-DITH-014` | MUST | The `checkerboard-2x1` option shall use the two threshold values `[0, 1]` across each row and shall reverse their phase on each successive row, producing a two-dimensional checkerboard when tiled across the image. | I/A | `AT-ORDERED-CHECKERBOARD` |
| `FR-DITH-015` | MUST | The selected ordered-matrix identifier shall be treated as a conversion setting, trigger a new draft conversion when changed, and serialize without loss into presets, completed-final projects, and conversion metadata. | T/I | `AT-ORDERED-MATRIX-ROUNDTRIP` |
| `FR-DITH-016` | MUST | Error diffusion shall traverse the complete active screen in alternating serpentine rows, shall propagate error across attribute-cell boundaries, and shall quantize every pixel only to the INK/PAPER pair selected for that pixel's own attribute cell. | A/T | `AT-DIFFUSION-SERPENTINE` |

## 10. Conversion job lifecycle and responsiveness

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-JOB-001` | MUST | Every draft and final conversion shall receive a unique internal job identifier. | I/T | `AT-JOB-ID` |
| `FR-JOB-002` | MUST | A newer conversion request shall supersede any older conversion whose result is no longer applicable. | T | `AT-STALE-SUPPRESS` |
| `FR-JOB-003` | MUST | Results from cancelled or superseded jobs shall be discarded and shall never replace the current valid result. | T | `AT-STALE-SUPPRESS` |
| `FR-JOB-004` | MUST | Cancellation shall be acknowledged by the conversion worker and reflected in the UI within one second under the reference test conditions. | T | `AT-CANCEL-LATENCY` |
| `FR-JOB-005` | MUST | A cancelled, failed, partial, or superseded job shall not be exportable or saveable as a completed result. | T | `AT-PARTIAL-GUARD` |
| `FR-JOB-006` | MUST | For any conversion still running 500 ms after it starts, progress shall be visible by that time and shall update at least once per second while measurable work continues. | T | `AT-PROGRESS` |
| `FR-JOB-007` | MUST | Progress shall communicate indeterminate phases honestly and shall not claim a false completion percentage. | D/I | `AT-PROGRESS-SEMANTICS` |
| `NFR-RESP-001` | MUST | Direct UI interactions unrelated to conversion shall produce visible acknowledgement within 100 ms at the 95th percentile on documented reference hardware. | T | `AT-UI-LATENCY` |
| `NFR-RESP-002` | MUST | Conversion shall execute outside the main UI thread sufficiently to preserve `NFR-RESP-001`. | T/I | `AT-UI-NONBLOCKING` |
| `NFR-PERF-001` | MUST | v1.0 shall impose no wall-clock completion deadline on a valid conversion. | I | `AT-PERF-POLICY` |
| `NFR-PERF-002` | MUST | Absence of a wall-clock deadline shall not permit non-termination; each optimization level shall remain bounded as required by `FR-OPT-002`. | A/I | `AT-OPT-BOUNDS` |

### 10.1 Worker failure

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-REC-001` | MUST | The application shall detect a conversion worker crash, invalid response, or defined internal timeout condition. | T | `AT-WORKER-FAIL` |
| `FR-REC-002` | MUST | Worker failure shall preserve the source, current settings, edit history, and last completed valid result held by the UI process. | T | `AT-WORKER-PRESERVE` |
| `FR-REC-003` | MUST | After worker failure, the application shall stop the affected job, display a diagnostic error, and offer a user-initiated retry. | T/D | `AT-WORKER-RETRY` |
| `FR-REC-004` | MUST | The application shall not retry a failed conversion automatically and shall not reload the complete application without user confirmation. | T | `AT-WORKER-NOAUTO` |
| `FR-REC-005` | MUST | Worker failure shall not corrupt the open project or transform partial data into a completed result. | T | `AT-WORKER-INTEGRITY` |

## 11. Preview and inspection

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-PREV-001` | MUST | The application shall provide a `Pixel preview` showing the exact decoded 256×192 converted pixels. | T/A | `AT-PIXEL-PREVIEW` |
| `FR-PREV-002` | MUST | The application shall provide a separate `Display preview` using nearest-neighbor scaling, configured pixel aspect, selected border color, and optional profile display calibration. | T/D | `AT-DISPLAY-PREVIEW` |
| `FR-PREV-003` | MUST | Normative previews shall not add CRT blur, scanlines, bloom, persistence, distortion, or noise. | T/I | `AT-PREVIEW-CLEAN` |
| `FR-PREV-004` | MAY | Decorative CRT effects may be offered only as a clearly non-normative view and shall not affect conversion, export, project determinism, or quality scoring. | T | `AT-CRT-SEPARATION` |
| `FR-PREV-005` | MUST | Border color shall be stored in project and metadata and shown in display preview, but shall not be represented as part of `.scr` bytes. | T/A | `AT-BORDER` |
| `FR-PREV-006` | MUST | The interface shall distinguish current, stale, draft, running, cancelled, failed, and completed-final result states without relying on color alone. | T/D | `AT-RESULT-STATE` |
| `FR-PREV-007` | MUST | The user shall be able to inspect conversion warnings, `.scr` validation status, selected optimization level, and quality measurements associated with the displayed final result. | D/T | `AT-RESULT-INSPECTION` |
| `FR-PREV-008` | SHOULD | Zoom, pan, before/after comparison, pixel-grid overlay, attribute-grid overlay, and palette visualization should be provided for detailed inspection. | D | `AT-INSPECTION-TOOLS` |
| `FR-PREV-009` | SHOULD | Pointing at or keyboard-navigating the converted preview should expose pixel coordinates, cell coordinates, attribute offset and byte, INK, PAPER, shared BRIGHT state, selected pixel bit, and the cell bitmap bytes. | D/T | `AT-ATTRIBUTE-INSPECTOR` |
| `FR-PREV-010` | SHOULD | A completed final result should support explicit export of a versioned inspection JSON report containing mode dimensions, byte counts, enabled and used base color codes, brightness-plane counts, and a lossless attribute representation. | T | `AT-INSPECTION-EXPORT` |

## 12. Profiles and presets

### 12.1 Profile boundary

Imported v1.0 profiles are safe declarative data applied to the built-in ZX standard-mode renderer and `.scr` exporter. They are not arbitrary machine definitions.

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-PROF-001` | MUST | Imported profiles shall use JSON and validate against a versioned schema before installation or use. | T/I | `AT-PROFILE-SCHEMA` |
| `FR-PROF-002` | MUST | A profile shall contain no executable code, scripts, macros, external references, network references, or paths to unrelated local files. | T/I | `AT-PROFILE-SANDBOX` |
| `FR-PROF-003` | MUST | The profile schema shall permit display-calibrated RGB values for the 15 visually distinct colors, default border color, pixel-aspect and preview-scaling information, color-distance and optimization weights, named conversion presets, and descriptive metadata. | T/I | `AT-PROFILE-FIELDS` |
| `FR-PROF-004` | MUST | A profile shall not change 256×192 geometry, the permitted attribute-height set, `.scr` section ordering, ink/paper semantics, BRIGHT-policy semantics, palette-selection semantics, or disabled `FLASH` behavior. | T | `AT-PROFILE-BOUNDARY` |
| `FR-PROF-005` | MUST | Executable techniques and exporters shall remain built into the application. | I | `AT-PLUGIN-BOUNDARY` |
| `FR-PROF-006` | MUST | Invalid profile import shall be rejected atomically with one or more precise, stable validation errors. | T | `AT-PROFILE-REJECT` |
| `FR-PROF-007` | MUST | Profile validation shall apply documented size, nesting, string, collection, numeric, and complexity limits before installation. | T/A | `AT-PROFILE-LIMITS` |

### 12.2 Identity and lifecycle

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-PROF-008` | MUST | Every profile shall have an immutable stable identifier, semantic version, schema version, and content hash. | I/T | `AT-PROFILE-IDENTITY` |
| `FR-PROF-009` | MUST | Importing the same identifier and semantic version with different content shall be rejected. | T | `AT-PROFILE-CONFLICT` |
| `FR-PROF-010` | MUST | A newer profile version shall install alongside older versions unless the user explicitly removes an older installed version. | T | `AT-PROFILE-SIDE-BY-SIDE` |
| `FR-PROF-011` | MUST | Built-in profiles shall not be silently replaced or shadowed by imported profiles. | T | `AT-PROFILE-BUILTIN` |
| `FR-PROF-012` | MUST | Every saved project shall embed the exact profile snapshot used for its completed result. | T/I | `AT-PROJECT-PROFILE` |
| `FR-PROF-013` | MUST | Removing an installed profile shall not invalidate a project containing its own valid embedded snapshot. | T | `AT-PROJECT-PROFILE` |
| `FR-PROF-014` | MUST | Named presets shall serialize complete versioned setting values and shall not alter fixed ZX constraints. | T/I | `AT-PRESET` |

## 13. Export requirements

### 13.1 Export set and behavior

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-EXP-001` | MUST | A completed final result shall support export as a rendered preview PNG, a size-valid `.scr` for the selected attribute height, and versioned conversion metadata JSON. | T | `AT-EXPORT-SET` |
| `FR-EXP-002` | MUST | The application shall support saving the self-contained `.rccproject` project defined in Section 15. | T | `AT-PROJECT-SAVE` |
| `FR-EXP-003` | MAY | Multiple artifacts may be downloaded separately or as a validated ZIP export bundle. | T | `AT-EXPORT-BUNDLE` |
| `FR-EXP-004` | MUST | Export shall begin only after explicit user action and shall never start automatically when conversion finishes. | T | `AT-EXPORT-EXPLICIT` |
| `FR-EXP-005` | MUST | Suggested filenames shall be deterministic, sanitized, non-empty, and safe on every supported operating system. | T | `AT-FILENAME` |
| `FR-EXP-006` | MUST | Existing files shall not be silently overwritten; the browser or application shall request a user decision where the platform exposes overwrite control. | T/D | `AT-OVERWRITE` |
| `FR-EXP-007` | MUST | Export failure shall preserve the project and last completed result and shall produce a stable error. | T | `AT-EXPORT-FAIL` |
| `FR-EXP-008` | MUST | Failed, cancelled, partial, superseded, stale, or draft results shall not be exportable as completed output. | T | `AT-EXPORT-STATE` |

### 13.2 `.scr` format and validation

The `.scr` artifact contains 6,144 bytes of bitmap memory followed by `32 × (192 / h)` bytes of row-major attribute memory, where `h` is the selected attribute height. Total sizes are 6,912 bytes for 8×8, 7,680 for 8×4, 9,216 for 8×2, and 12,288 for 8×1. Bitmap bytes use ZX Spectrum display-file scanline addressing. The modes below 8×8 are application-defined software modes and require compatible display software.

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-SCR-001` | MUST | `.scr` export shall run validation before every export. | T | `AT-SCR-VALIDATE` |
| `FR-SCR-002` | MUST | Validation shall confirm the 6,144-byte bitmap, the selected mode's exact attribute-section size, and total size 6,912, 7,680, 9,216, or 12,288 bytes. | A/T | `AT-SCR-SIZE` |
| `FR-SCR-003` | MUST | Validation shall confirm the ZX Spectrum bitmap addressing transformation and attribute-memory ordering. | A | `AT-SCR-ADDRESSING` |
| `FR-SCR-004` | MUST | Validation shall confirm every cell's pixel/attribute constraints and `FLASH = 0`. | A | `AT-SCR-CONSTRAINTS` |
| `FR-SCR-005` | MUST | Exported bytes shall match the completed final result currently selected for export. | A/T | `AT-SCR-CURRENT` |
| `FR-SCR-006` | MUST | Any `.scr` validation failure shall block export and produce a diagnostic error. | T | `AT-SCR-BLOCK` |
| `FR-SCR-007` | MUST | The product shall classify 8×8 `.scr` as `NATIVE_STATIC` and smaller attribute heights as software-mode data requiring a compatible renderer; it shall not claim physical-hardware execution unless separate evidence exists. | I | `AT-CLAIMS` |

## 14. Conversion metadata contract

The metadata file shall be UTF-8 JSON conforming to a published, versioned schema. Unknown additive fields may be ignored within the same major schema version; removal or incompatible semantic change requires a new major schema version.

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-META-001` | MUST | Metadata shall contain schema version and application version. | I/T | `AT-METADATA-CONTENT` |
| `FR-META-002` | MUST | Metadata shall contain the source-content hash, profile identifier/version/content hash, `.scr` hash, and decoded-preview-pixel hash. Metadata shall not contain a hash of itself. Encoded preview-PNG bytes are non-normative and need not be identical across platforms. | I/T | `AT-METADATA-HASHES` |
| `FR-META-003` | MUST | Metadata shall record source interpretation, EXIF orientation handling, ICC handling, alpha background, crop, geometric transformations, and resampling. | I/T | `AT-METADATA-SOURCE` |
| `FR-META-004` | MUST | Metadata shall contain complete conversion controls, selected preset identity where applicable, optimization level, algorithm versions, and random seed. | I/T | `AT-METADATA-SETTINGS` |
| `FR-META-005` | MUST | Metadata shall contain attribute height, BRIGHT policy, enabled/effective ZX palette, every attribute byte or an unambiguous lossless representation, and border color. | I/A | `AT-METADATA-ZX` |
| `FR-META-006` | MUST | Metadata shall contain quality metric specification version, measured values, warnings, fidelity class, and `.scr` validation result. | I/T | `AT-METADATA-QUALITY` |
| `FR-META-007` | MUST | Metadata shall include conversion completion timestamp as informational provenance while excluding it from deterministic conversion hashes. | I/A | `AT-METADATA-TIME` |
| `FR-META-008` | MUST | Metadata shall identify non-normative preview calibration separately from conversion data. | I | `AT-METADATA-PREVIEW` |
| `FR-META-009` | MUST | Metadata shall contain no source pixels, local filesystem paths, or user identity unless a later explicit feature and consent model is approved. | T/I | `AT-METADATA-PRIVACY` |
| `FR-META-010` | MUST | The metadata schema shall identify its deterministic projection: the set of fields whose parsed names, types, values, arrays, and object relationships are compared for conversion reproducibility. Completion time, environment identification, and other informational provenance shall not belong to this projection. | I/A | `AT-METADATA-DETERMINISM` |
| `FR-META-011` | MUST | Deterministic metadata comparison shall parse and compare the deterministic projection semantically. JSON member order, insignificant whitespace, and raw serialized byte differences shall not affect the comparison. | I/A | `AT-METADATA-DETERMINISM` |

### 14.1 Minimum logical metadata structure

```json
{
  "schema_version": "1.0.0",
  "application_version": "1.0.0",
  "fidelity_class": "NATIVE_STATIC",
  "source": {
    "sha256": "...",
    "format": "png",
    "interpretation": {}
  },
  "profile": {
    "id": "org.retroconverter.zx48.default",
    "version": "1.0.0",
    "sha256": "..."
  },
  "conversion": {
    "quality_level": "High",
    "seed": "...",
    "settings": {
      "dithering": {
        "method": "error_diffusion",
        "amount_percent": 65,
        "ordered_matrix": null
      }
    },
    "algorithm_versions": {}
  },
  "zx_spectrum": {
    "mode": "zx48-standard-256x192",
    "border_color": 0,
    "attributes": "..."
  },
  "quality": {},
  "warnings": [],
  "validation": {},
  "outputs": {},
  "completed_at_utc": "2026-07-22T00:00:00Z"
}
```

Field names and representations shown above are the minimum logical contract, not a substitute for the controlled JSON Schema.

## 15. Completed-final project persistence

### 15.1 `.rccproject` container

A v1.0 project is a completed-final snapshot saved after a successful current `High` conversion. Work-in-progress project saving and project migration are outside v1.0 scope. A project is a ZIP-based container with the `.rccproject` extension. It contains only declared entries and uses a versioned manifest. The canonical container layout shall include:

```text
manifest.json
source/original.<validated-extension>
profile/profile.json
settings/conversion.json
artifacts/result.scr
artifacts/preview.png
artifacts/metadata.json
integrity/sha256.json
```

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-PROJ-001` | MUST | A saved project shall represent a current completed `High` result and shall be self-contained, including original source bytes, exact profile snapshot, complete settings, seed, schema versions, application version, generated `.scr`, preview, metadata, and integrity hashes. | I/T | `AT-PROJECT-CONTENT` |
| `FR-PROJ-002` | MUST | The manifest shall declare every allowed archive entry, its media type, role, size, and SHA-256 hash. | I/T | `AT-PROJECT-MANIFEST` |
| `FR-PROJ-003` | MUST | The importer shall reject undeclared files, missing required files, duplicate normalized paths, unsafe paths, links, encrypted entries, schema violations, hash mismatches, or resource-limit violations. | T | `AT-PROJECT-SECURITY` |
| `FR-PROJ-004` | MUST | Opening a project shall validate the complete container before replacing the open project. | T | `AT-PROJECT-ATOMIC` |
| `FR-PROJ-005` | MUST | The same application version shall recompute bit-identical `.scr` bytes and decoded preview pixels, equal cell attributes and quality measurements, and semantically equal deterministic metadata fields from every valid v1.0 project. | A | `AT-PROJECT-REPRO` |
| `FR-PROJ-006` | MUST | Saving a project shall be an explicit user action; the application shall not continuously autosave or retain an implicit crash-recovery copy. | T/I | `AT-NO-AUTOSAVE` |
| `FR-PROJ-007` | MUST | The application shall visibly indicate unsaved changes and warn before closing, reloading, replacing, or opening another project where the browser permits such warning. | T/D | `AT-DIRTY-WARN` |
| `FR-PROJ-008` | MUST | Recovery data shall not be written to persistent browser storage as a substitute for explicit project save. | I/T | `AT-NO-RECOVERY` |
| `FR-PROJ-009` | MUST | Project save shall be unavailable when there is no current completed `High` result, including while the only result is draft, stale, running, cancelled, failed, partial, or superseded. | T/D | `AT-PROJECT-FINAL-ONLY` |
| `FR-PROJ-010` | MUST | A v1.0 application shall reject a project whose schema or required application compatibility range it does not support, using a stable incompatibility error and without replacing the open project. v1.0 shall not migrate incompatible projects. | T | `AT-PROJECT-COMPATIBILITY` |

## 16. Local storage, privacy, and offline operation

### 16.1 Local processing and privacy

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `NFR-PRIV-001` | MUST | Image decoding, conversion, preview generation, project processing, validation, and export shall run locally on the user's device. | I/T | `AT-NETWORK-ISOLATION` |
| `NFR-PRIV-002` | MUST | The application shall not upload source images, project contents, conversion results, diagnostic reports, profiles, or usage events. | I/T | `AT-NETWORK-ISOLATION` |
| `NFR-PRIV-003` | MUST | v1.0 shall contain no telemetry, analytics, advertising, automatic crash upload, or third-party runtime resource. | I/T | `AT-NO-TELEMETRY` |
| `NFR-PRIV-004` | MUST | Persistent browser storage may contain only preferences, installed profiles, named presets, and resources required for offline operation. | I/T | `AT-STORAGE-SCOPE` |
| `NFR-PRIV-005` | MUST | Source images, completed results, and projects shall persist only through an explicit user save/export action. | T/I | `AT-STORAGE-NOSOURCE` |
| `NFR-PRIV-006` | MUST | The application shall provide a means to review categories of retained application data and delete preferences, profiles, and presets. | T/D | `AT-STORAGE-CONTROL` |

### 16.2 Offline behavior and installation

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `NFR-OFF-001` | MUST | After the first successful complete load, the core v1.0 workflow shall operate without network connectivity on every supported browser. | T | `AT-OFFLINE` |
| `NFR-OFF-002` | MUST | PWA installation shall be supported where the browser exposes an installation capability. | T | `AT-PWA-INSTALL` |
| `NFR-OFF-003` | MUST | Lack of a PWA installation interface in a supported browser, including Firefox where applicable, shall not be considered a product failure if offline browser operation succeeds. | I/T | `AT-PWA-CAPABILITY` |
| `NFR-OFF-004` | MUST | Offline cache integrity and recovery from an incomplete initial cache shall be tested on every supported browser. | T | `AT-CACHE-RECOVERY` |
| `NFR-OFF-005` | MUST | v1.0 shall use normal browser and PWA update behavior. The product shall not claim controlled activation, preservation of an active session across an update, or application-managed rollback to a previously cached version. | I | `AT-UPDATE-CLAIMS` |

## 17. Security and resource limits

All imported files are untrusted. Browser sandboxing is necessary but not sufficient; parsers and schemas shall enforce explicit limits and atomic failure.

### 17.1 Normative public and minimum limits

| Resource | v1.0 limit |
|---|---:|
| Source compressed file | 50 MiB maximum |
| Source width or height | 8,192 pixels maximum |
| Source total pixels | 32 megapixels maximum |
| Embedded ICC profile | 4 MiB maximum |
| Aggregate source metadata | 8 MiB maximum |
| Imported profile JSON | 1 MiB maximum |
| JSON nesting depth | 32 levels maximum |
| Single JSON string | 256 KiB maximum |
| `.rccproject` compressed size | 100 MiB maximum |
| `.rccproject` expanded size | 128 MiB maximum |
| `.rccproject` entries | 64 maximum |
| Single archive-entry compression ratio | 100:1 maximum |
| Worker message payload | 64 MiB maximum |

Version-controlled internal limits may be tightened without revising this SRS only if all valid inputs within the public limits continue to work and all applicable conformance tests pass.

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `NFR-SEC-001` | MUST | Parsers shall apply relevant compressed size, decoded size, dimension, metadata, ICC, JSON, archive, allocation, and message limits before unbounded work or allocation. | T/I | `AT-RESOURCE-LIMITS` |
| `NFR-SEC-002` | MUST | Errors shall identify the documented limit exceeded using a stable error code and readable message. | T | `AT-LIMIT-ERRORS` |
| `NFR-SEC-003` | MUST | Archive handling shall reject absolute paths, parent traversal, alternate path separators that normalize unsafely, duplicate normalized names, symbolic links, hard links, devices, and encrypted content. | T | `AT-ARCHIVE-TRAVERSAL` |
| `NFR-SEC-004` | MUST | Imported files shall not execute code, initiate network access, or obtain access to unrelated local files. | T/I | `AT-IMPORT-ISOLATION` |
| `NFR-SEC-005` | MUST | Profile numeric values shall be checked for allowed ranges and shall reject `NaN`, infinity, overflow, or ambiguous representations. | T | `AT-PROFILE-NUMERIC` |
| `NFR-SEC-006` | MUST | Validation failure shall be atomic and shall leave current application and project state intact. | T | `AT-FAIL-ATOMIC` |
| `NFR-SEC-007` | MUST | Dependency and build artifacts shall be reproducible or integrity-pinned according to the controlled build process. | I | `AT-SUPPLY-CHAIN` |
| `NFR-SEC-008` | MUST | The release evidence shall include malformed-input, decompression-bomb, parser-fuzzing, path-traversal, and resource-exhaustion results. | I | `EVID-SECURITY` |

## 18. Accessibility and user interaction

The enumerated requirements in this section define the normative v1.0 accessibility baseline. v1.0 does not claim complete WCAG 2.2 Level AA conformance. References to individual WCAG criteria define the required behavior for those criteria only.

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `NFR-A11Y-001` | MUST | Every core workflow action shall be operable by keyboard without requiring pointer input. | T/D | `AT-A11Y-KEYBOARD` |
| `NFR-A11Y-002` | MUST | Keyboard focus shall be visible, logically ordered, and not trapped except in an accessible modal interaction. | T | `AT-A11Y-FOCUS` |
| `NFR-A11Y-003` | MUST | Controls, groups, previews, status messages, progress, warnings, and errors shall have programmatically determinable names, roles, states, and relationships. | T/I | `AT-A11Y-NAME` |
| `NFR-A11Y-004` | MUST | Text, controls, focus indicators, and meaningful graphical elements shall meet applicable WCAG 2.2 AA contrast requirements. | T | `AT-A11Y-CONTRAST` |
| `NFR-A11Y-005` | MUST | Result state, validation, warnings, and errors shall not be communicated by color alone. | T/D | `AT-A11Y-COLOR` |
| `NFR-A11Y-006` | MUST | Progress and cancellation shall be accessible to assistive technology without generating excessive announcements. | T/D | `AT-A11Y-PROGRESS` |
| `NFR-A11Y-007` | MUST | The application shall respect reduced-motion preferences; no essential v1.0 function shall depend on animation. | T | `AT-A11Y-MOTION` |
| `NFR-A11Y-008` | MUST | At 200% browser zoom, the primary workflow shall remain usable without loss of information or functionality at the supported desktop viewport baseline. | T | `AT-A11Y-REFLOW` |
| `NFR-A11Y-009` | SHOULD | Previews and visual adjustment controls should provide accessible textual values and reset mechanisms where a fully equivalent non-visual representation is not practical. | D/I | `AT-A11Y-PREVIEW` |
| `NFR-A11Y-010` | MUST | The release evidence shall include automated checks and manual keyboard and screen-reader verification. | I | `EVID-A11Y` |

## 19. Browser and operating-system compatibility

The supported matrix is defined relative to the release date and frozen in each release report.

| Browser | Required versions at release | Operating systems |
|---|---|---|
| Chrome | Current and previous major | Windows 11; current and previous macOS; Ubuntu 24.04 LTS |
| Edge | Current and previous major | Windows 11; current and previous macOS where vendor-supported; Ubuntu 24.04 LTS where vendor-supported |
| Firefox | Current and previous major | Windows 11; current and previous macOS; Ubuntu 24.04 LTS |
| Safari | Current and previous major | Current and previous macOS |

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `NFR-COMP-001` | MUST | All mandatory v1.0 workflows shall pass on every applicable browser/OS combination in the frozen release matrix. | T | `AT-COMP-MATRIX` |
| `NFR-COMP-002` | MUST | Exact browser and operating-system versions tested shall be recorded in the release report. | I | `EVID-COMPAT` |
| `NFR-COMP-003` | MUST | Conversion determinism shall pass across the complete supported matrix as required by `FR-DET-003`. | A | `AT-CROSS-PLATFORM` |
| `NFR-COMP-004` | MUST | Browser capability differences shall be handled explicitly; unavailable optional platform features shall not silently break core workflow. | T/I | `AT-CAPABILITY-FALLBACK` |
| `NFR-COMP-005` | MUST | Mobile operating systems, touch-first interaction, and small-screen layouts shall not be claimed as supported in v1.0. | I | `AT-CLAIMS` |

The exact reference hardware and desktop viewport used for latency measurement shall be frozen in the v1.0 verification specification before release-candidate testing. It shall be representative of a supported, non-high-end system and shall be recorded in the evidence package.

## 20. Quality measurement and regression acceptance

### 20.1 Corpus and metrics

Two controlled corpora are required:

- **Conformance corpus:** valid, boundary, malformed, and adversarial files used to verify decoding, constraints, formats, determinism, and failure behavior.
- **Quality corpus:** representative photographs, illustrations, gradients, skin tones, high-frequency detail, low-light images, saturated colors, text-like edges, and difficult 8×8 attribute conflicts.

Quality is evaluated by rendering the completed Spectrum result into the controlled 8-bit sRGB comparison space and comparing it with the normalized, framed source. The release gate uses a versioned composite of perceptual color difference and structural similarity.

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `NFR-QUAL-001` | MUST | Conversions used for release comparison shall be deterministic and run with frozen source files, profiles, settings, seeds, and metric versions. | A | `AT-QUALITY-REPRO` |
| `NFR-QUAL-002` | MUST | The exact color-difference formula, structural-similarity formula, preprocessing, weights, corpus, and thresholds shall be defined in a version-controlled verification specification before v1.0 acceptance testing. | I | `EVID-QUALITY-SPEC` |
| `NFR-QUAL-003` | MUST | The aggregate quality-corpus score shall not regress beyond the approved aggregate tolerance. | A | `AT-QUALITY-AGG` |
| `NFR-QUAL-004` | MUST | No individual quality-corpus image shall regress beyond the approved per-image tolerance. | A | `AT-QUALITY-IMAGE` |
| `NFR-QUAL-005` | MUST | Golden `.scr` and deterministic metadata artifacts shall remain the correctness baseline independently of perceptual quality scores. | A | `AT-GOLDEN` |
| `NFR-QUAL-006` | MUST | Manual visual review shall supplement but shall not replace automated correctness and regression gates. | I/D | `EVID-VISUAL-REVIEW` |
| `NFR-QUAL-007` | MUST | Production users shall not be able to modify release-gate thresholds or controlled corpus data through application settings or imported profiles. | T/I | `AT-QUALITY-CONTROL` |
| `NFR-QUAL-008` | MUST | Any later metric, weight, corpus, or threshold change shall have a new controlled version and documented baseline reapproval. | I | `EVID-BASELINE-CHANGE` |

### 20.2 Interpretation of “quality first”

Quality-first means that the bounded `High` algorithm may take longer than interactive processing and may prefer a demonstrably better result over a faster approximation. It does not waive responsiveness, progress, cancellation, determinism, resource safety, or termination requirements.

## 21. Errors and local diagnostics

### 21.1 Stable errors

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-ERR-001` | MUST | User-relevant failures shall expose a stable machine-readable error code and a concise human-readable explanation. | T | `AT-ERROR-CONTRACT` |
| `FR-ERR-002` | MUST | Error messages shall identify the failed operation, preserve valid user state, and provide a safe next action where one exists. | T/D | `AT-ERROR-UX` |
| `FR-ERR-003` | MUST | Errors shall not expose stack traces, secrets, unrelated local paths, source pixels, or internal implementation details in the normal user interface. | T/I | `AT-ERROR-PRIVACY` |
| `FR-ERR-004` | MUST | Error-code meaning shall remain backward-compatible within the same major error-contract version. | I/T | `AT-ERROR-VERSION` |

Recommended initial error families are `IMPORT_*`, `ICC_*`, `PROFILE_*`, `PROJECT_*`, `CONVERSION_*`, `WORKER_*`, `VALIDATION_*`, `EXPORT_*`, `STORAGE_*`, and `UPDATE_*`. The controlled error catalog shall define exact codes.

### 21.2 Diagnostic report

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `FR-DIAG-001` | MUST | The user shall be able to export a local diagnostic report. | T | `AT-DIAG-EXPORT` |
| `FR-DIAG-002` | MUST | The report shall include application and schema versions, browser and OS identification, worker failures and stable errors, resource-limit and validation failures, and installed profile identifiers and versions. | I/T | `AT-DIAG-CONTENT` |
| `FR-DIAG-003` | MUST | The report shall not include source pixels, project content, local file paths, filenames supplied by the user, or personal data. | T/I | `AT-DIAG-PRIVACY` |
| `FR-DIAG-004` | MUST | Diagnostic information shall not be uploaded automatically. | I/T | `AT-NETWORK-ISOLATION` |

## 22. Release acceptance and governance

### 22.1 Required evidence package

Every release candidate shall produce:

1. Requirements-to-test traceability matrix
2. Browser/OS compatibility report with exact versions
3. Conformance-corpus results
4. Quality-corpus results
5. Golden-artifact and cross-platform determinism comparison
6. Accessibility test report
7. Security and malformed-input test report
8. Offline-cache integrity and incomplete-cache recovery report
9. Known deviations, residual risks, and approved waivers
10. Build, dependency, application, schema, profile, algorithm, metric, and corpus version record

| ID | Priority | Requirement | Verify | Acceptance reference |
|---|---|---|---|---|
| `GOV-ACC-001` | MUST | Every normative requirement shall map to one or more test cases, inspections, analyses, or demonstrations in the traceability matrix. | I | `EVID-TRACE` |
| `GOV-ACC-002` | MUST | Every test result shall identify the application build, environment, input fixture version, and outcome. | I | `EVID-TEST-RECORD` |
| `GOV-ACC-003` | MUST | v1.0 release acceptance requires every `MUST` requirement to pass or have an explicit approved waiver. | I | `EVID-APPROVAL` |
| `GOV-ACC-004` | MUST | A waiver shall identify the affected requirement, evidence, user impact, risk, mitigation, owner, approver, expiry or review point, and corrective plan. | I | `EVID-WAIVER` |
| `GOV-ACC-005` | MUST | Unresolved failures shall not be relabeled as passed through a quality-score improvement or unrelated passing result. | I | `EVID-INTEGRITY` |
| `GOV-ACC-006` | MUST | The final release report shall record document version, approval state, approvers, and approval date. | I | `EVID-APPROVAL` |

### 22.2 Acceptance summary by capability

| Capability | Primary requirement groups | Blocking evidence |
|---|---|---|
| Input safety and fidelity | `FR-IMPORT-*`, `NFR-SEC-*` | Conformance and malformed-input reports |
| Deterministic conversion | `FR-DET-*`, `FR-OPT-*`, `FR-ZX-*`, `FR-DITH-*` | Cross-platform comparison and golden artifacts |
| Workflow and responsiveness | `FR-EDIT-*`, `FR-JOB-*`, `NFR-RESP-*` | Functional and latency test reports |
| Preview and export | `FR-PREV-*`, `FR-EXP-*`, `FR-SCR-*`, `FR-META-*` | Visual inspection, schema validation, artifact validation |
| Profiles and projects | `FR-PROF-*`, `FR-PROJ-*` | Schema, security, final-project, and same-version round-trip tests |
| Offline and privacy | `NFR-PRIV-*`, `NFR-OFF-*` | Network-isolation, offline, cache-integrity, and incomplete-cache recovery reports |
| Accessibility | `NFR-A11Y-*` | Automated and manual accessibility report |
| Compatibility | `NFR-COMP-*` | Frozen browser/OS matrix report |
| Image quality | `NFR-QUAL-*` | Controlled metric specification and corpus report |
| Diagnostics and governance | `FR-ERR-*`, `FR-DIAG-*`, `GOV-ACC-*` | Diagnostic tests and formal release package |

## 23. External controlled specifications and data

The following controlled items shall exist before v1.0 acceptance. Their exact content may evolve without changing this SRS only under their own version and approval controls and without weakening a normative requirement.

| ID | Controlled item | Minimum contents |
|---|---|---|
| `RC-DES-001` | Conversion design specification | Pipeline order, controlled sRGB allow-list, fixed-point/integer arithmetic where used, resampling, adjustments, dithering scaling and rounding, optimizer bounds, canonical encodings |
| `RC-SCH-001` | Profile JSON Schema | Allowed fields, ranges, complexity constraints, identity, semantic versioning |
| `RC-SCH-002` | Metadata JSON Schema | Required fields, compatibility rules, deterministic semantic projection, informational field classification |
| `RC-SCH-003` | Completed-final project manifest schema | Required entries, hashes, media types, container version, exact compatibility rules |
| `RC-SCH-004` | Error catalog | Stable codes, meanings, user messages, recovery guidance |
| `RC-VER-001` | Verification specification | Exact tests, reference hardware, browser matrix, latency procedure, metric formulas, thresholds |
| `RC-COR-001` | Conformance corpus | Valid, boundary, malformed, adversarial, ICC, EXIF, PNG, JPEG, archive, and JSON fixtures |
| `RC-COR-002` | Quality corpus | Frozen representative sources, settings, profiles, seeds, and review notes |
| `RC-GOLD-001` | Golden artifacts | `.scr`, deterministic metadata, decoded preview pixel hashes, expected validation output |
| `RC-REL-001` | Release evidence template | Traceability, compatibility, quality, accessibility, security, deviations, waivers, approvals |

## 24. Assumptions, dependencies, and open governance fields

- The application is delivered as a browser application with offline resources and capability-aware PWA installation.
- Browser APIs are used for user-mediated file selection and download, but not for normative image decoding or resampling.
- Cryptographic hashes use SHA-256 unless a later controlled schema version explicitly replaces it.
- Reference hardware, exact metric formulas, metric tolerances, corpus content, and approver names remain controlled TBDs that must be resolved before v1.0 release-candidate acceptance.
- Open-source license, repository, contribution policy, and product distribution endpoint are product-governance decisions outside this SRS, but their absence shall not weaken security, privacy, or build-integrity requirements.

---

# Appendix A — Informative product roadmap

This appendix is non-normative. No item below is part of v1.0 acceptance.

Potential later releases may add:

- Additional machines and native display modes
- Declarative generic attribute-based profiles
- Hardware-executable output packages with validated player contracts
- Raster-timed palette or register effects
- Temporal flicker and interlace techniques with frame-duration models
- Mixed-mode temporal techniques
- Video input, frame-rate conversion, and explicit audio policy
- TAP/TZX, assembler, BASIC, compression, sprite-sheet, tile, font, and emulator exports
- Runtime technique plugins with signing, permissions, isolation, and compatibility controls
- Calibrated CRT and physical-display simulation
- Mobile and touch-first layouts
- Batch conversion, animation, sprite, tile, and character-map editors
- Emulator integration and physical-hardware validation suites
- Work-in-progress project saving and controlled project migration
- Controlled application-update activation and application-managed rollback

Later work shall preserve the distinction between:

1. Native static display modes
2. Single-frame raster/register effects
3. Multi-frame temporal blending
4. Mixed-mode temporal blending
5. Hardware-executable artifacts
6. Simulation-only artifacts

Each later technique shall define its timing model, frame durations, palette/register events, memory layout, feasibility classification, preview fidelity, export contract, and validation evidence.

# Appendix B — Informative architecture overview

The implementation is expected to separate UI orchestration from controlled conversion processing:

```text
Browser UI
  ├─ source and project workflow
  ├─ settings, undo/redo, preview, validation, export
  └─ accessibility and offline application shell

Controlled conversion worker
  ├─ built-in PNG/JPEG decoder
  ├─ EXIF handling and controlled sRGB interpretation
  ├─ deterministic framing, adjustment, and resampling
  ├─ ZX cell optimizer and dithering
  ├─ `.scr` serializer and validator
  └─ metrics, metadata, and preview pixels

Validated declarative data
  ├─ built-in/imported ZX-compatible profiles
  ├─ presets
  ├─ project manifests
  └─ controlled schema and algorithm versions
```

This architecture is informative. Equivalent implementations are acceptable if they satisfy every normative requirement.

# Appendix C — Informative ZX Spectrum `.scr` reference

The v1.0 artifact consists of:

- Bytes `0..6143`: bitmap data
- Bytes `6144..end`: row-major attribute data for 32×(192 / selected attribute height) cells

For active-display coordinate `(x, y)`, the bitmap byte contains eight horizontal pixels and uses the ZX Spectrum's interleaved scanline arrangement. The exact address equation and bit order shall be frozen in `RC-DES-001` and verified by `AT-SCR-ADDRESSING` using independently generated golden files.

The attribute byte logically contains:

```text
bit 7      FLASH (always 0 in v1.0)
bit 6      BRIGHT
bits 5..3  PAPER
bits 2..0  INK
```

Border color is controlled by an I/O operation on real hardware and is not part of the file; therefore it appears only in project data, metadata, and display preview.

# Appendix D — Informative decision record

The v1.0 baseline reflects the following approved planning choices:

- Implementation and acceptance baseline, not a concept brief or supplier contract
- ZX Spectrum 48K PAL standard static mode only
- Visual-simulation-first positioning with format-valid `.scr` export
- Declarative JSON profiles; built-in executable conversion and export logic
- Static PNG/JPEG input and broad desktop browser support
- Objective aggregate and per-image quality regression gates
- Quality-first processing without a wall-clock conversion deadline
- `Draft` and `High` optimization levels only
- Self-contained reproducible completed-final `.rccproject` projects; no work-in-progress save or migration
- Untagged and controlled-allow-list sRGB input; other ICC profiles rejected
- Fully local, offline-capable, no-telemetry operation
- Enumerated desktop accessibility baseline without a complete WCAG conformance claim
- Bit-identical normative conversion across supported platforms
- User-selectable dithering method and amount from 0% to 100%
- Automatic draft preview, explicit final conversion, transactional jobs
- Manual retry after worker failure and no implicit crash recovery
- Normal browser/PWA update behavior without controlled activation or application-managed rollback
- Formal release evidence and controlled waivers

# Appendix E — Review checklist

Before changing this document from draft to approved:

- [ ] Assign document owner, author, approvers, and approval date.
- [ ] Approve `RC-DES-001` conversion design specification.
- [ ] Freeze all JSON schemas and the stable error catalog.
- [ ] Nominate and document reference hardware and viewport.
- [ ] Freeze conformance and quality corpora.
- [ ] Approve exact quality formulas, weights, and thresholds.
- [ ] Generate independent `.scr` golden files.
- [ ] Complete requirements-to-test traceability.
- [ ] Review all resource limits against implementation feasibility.
- [ ] Confirm legal/open-source/distribution governance.
- [ ] Execute compatibility, accessibility, security, privacy, offline, and incomplete-cache recovery testing.
- [ ] Record deviations, waivers, residual risks, and final approval.
