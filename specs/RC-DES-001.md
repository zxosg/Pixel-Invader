# RC-DES-001 — Conversion Design Specification

| Field | Value |
|---|---|
| Product | Retro Converter |
| Target release | v1.0 |
| Status | Working draft |
| Authority | `RC-SRS-001` version `1.0-draft.3` |

## 1. Purpose

This controlled design specification freezes implementation details required for deterministic behavior. It may not weaken a normative SRS requirement.

## 2. Normative pipeline

The v1.0 conversion pipeline executes in this order:

1. Validate file envelope and identify content type.
2. Decode PNG or JPEG through the pinned normative decoder.
3. Apply EXIF orientation.
4. Validate color declaration against the controlled sRGB policy.
5. Convert supported input samples to controlled 8-bit sRGB.
6. Composite alpha against the selected background.
7. Apply framing and geometric transformations.
8. Resample to 256×192.
9. Apply versioned smoothing.
10. Apply versioned sharpening.
11. Apply versioned brightness, contrast, saturation, and gamma adjustments.
12. Evaluate ZX attribute-cell candidates with the selected dithering method and amount.
13. Select canonical cell attributes and binary pixels.
14. Serialize and independently validate the selected software-mode `.scr` artifact.
15. Compute quality measurements, deterministic metadata, and decoded preview pixels.

Unfrozen stages are marked `TBD` in this document and block release acceptance, not repository scaffolding.

## 3. ZX Spectrum screen and software attribute modes

### 3.1 Geometry

- Active pixels: 256×192
- Bitmap bytes: 6,144
- Attribute cells: 32×(192 / `h`), where `h ∈ {8, 4, 2, 1}`
- Attribute bytes: 768, 1,536, 3,072, or 6,144
- `.scr` size: 6,912, 7,680, 9,216, or 12,288 bytes
- Pixel bit order within one bitmap byte: leftmost pixel in bit 7, rightmost pixel in bit 0
- Attribute order: row-major, 32 bytes per cell row

The standard target produces one hardware screen. The optional mixed target
produces two independently valid screens with the same geometry and attribute
height. Their perceived preview is the per-channel floor of the 50/50 RGB
average. Temporal endpoint orientation is constant within each complete
8×`h` attribute cell and alternates only between whole cells; ZX mixed mode
never performs QL-style per-pixel checkerboard swapping between screens.
`Screen flicker suppression` controls this assignment: enabled alternates
complete ZX cells, while disabled keeps fixed Screen 1/Screen 2 endpoint order.

### 3.2 Bitmap address

For byte column `xByte` in `0..31` and scanline `y` in `0..191`, the zero-based bitmap offset is:

```text
((y & 0xC0) << 5)
| ((y & 0x07) << 8)
| ((y & 0x38) << 2)
| xByte
```

### 3.3 Attribute byte

```text
bit 7      FLASH, always 0 in v1.0
bit 6      BRIGHT
bits 5..3  PAPER
bits 2..0  INK
```

All attribute bytes must have bit 7 clear. To prevent ordered-dither seams
from equivalent pairs with reversed threshold polarity, every emitted attribute
uses the canonical orientation `INK code >= PAPER code`. Equal codes remain
permitted. The built-in palette uses channel
value `205` for normal colors and `255` for bright colors. The bit weights are
blue `1`, red `2`, green `4`; color `7` combines all three channels. Both normal
and bright black are `(0,0,0)`. Candidate ties select the numerically smallest
attribute byte after this orientation rule, which canonicalizes remaining
visually equivalent encodings.

Each cell evaluates the canonical combinations of `BRIGHT` (`0..1`),
`PAPER` (`0..7`), and `INK` (`0..7`) permitted by the selected BRIGHT policy and
enabled base color codes. `Auto` permits both planes, `On` permits only bit 6 set,
and `Off` permits only bit 6 clear. BRIGHT is one attribute-wide bit: both INK and
PAPER are decoded through the selected plane, and cross-plane pairs are impossible.

Attribute-pair selection and bitmap dithering are separate deterministic stages.
For attribute-pair selection only, a source sample with
`chroma = max(R,G,B) - min(R,G,B) >= 8` is hue-normalized per channel as
`round((channel - min) * max / chroma)`; samples below that threshold remain
unchanged. This removes a colored sample's neutral component so desaturated red,
cyan, and other hues select the matching palette ramp instead of an achromatic
or adjacent-hue pair. Bitmap decisions, diffusion errors, render scoring, and
exports continue to use the unmodified normalized source.

For a candidate pair, each hue-normalized selection sample is scored against the
closest point on the continuous line segment from PAPER to INK in 8-bit sRGB. With
`d = INK - PAPER`, `q = source - PAPER`, `n = d · d`, and `t = q · d`:

- if `n = 0` or `t <= 0`, use the squared distance to PAPER;
- if `t >= n`, use the squared distance to INK;
- otherwise let the perpendicular squared-distance numerator be
  `P = (q · q) * n - t * t` and the binary-mixture span-variance numerator be
  `V = t * (n - t)`. If `d` contains both positive and negative channel
  deltas, or differs in all three RGB channels, the per-pixel score is
  `(2 * P + V) / (2 * n)`; otherwise it is `P / n`.

Each per-pixel value is multiplied by the fixed scale `4096` and rounded to the
nearest integer; endpoint scores use the same scale exactly. The `V / (2 * n)`
term is a fixed one-half penalty for the color variance produced when a source
tone is represented by a problematic diagonal of the RGB palette cube, such as
cyan/red or black/white. Monotone ramps such as black/red, black/cyan,
red/yellow, and yellow/white do not receive this penalty, allowing one pair to
remain selected across adjacent attribute cells. This suppresses
complementary-color speckle and achromatic diagonal substitution without
discarding legitimate secondary-color ramps or coupling pair selection to a
particular dithering method or amount. Candidate cost is the sum across the
`8 * h` cell.
All terms remain within JavaScript's exact integer range. A lower cost wins;
equal costs use the lower canonical attribute byte. This selection score is
independent of dithering method, matrix, and amount, so changing dithering
strength cannot cause 8×`h` attribute-pair blocks to change color.

After the winning attribute is fixed, the selected dithering method and amount
quantize each pixel to that pair. Let `D` be the sum of squared 8-bit sRGB
differences between normalized source and rendered output. For `No dithering`
and every enabled method at 0%, the reported render cost is `400 * D`. Above 0%,
the cell is divided into fixed 2×2 blocks clipped at the cell bottom when
`h = 1`. Let `L` be the sum, across every block and channel, of squared
differences between source and output channel sums. For amount `p`, the reported
render cost is `400 * D + 2 * p * L`. This render cost reports the selected
output but does not participate in attribute-pair selection. The reported score
is the sum of render costs divided by 400 and rounded down.

For enabled error diffusion above 0%, optimizer version
`rc-zx-variable-attribute-high-13` adds an unrestricted reference-pattern stage
before the 8×`h` restriction:

1. A whole-frame serpentine Floyd–Steinberg pass, beginning right-to-left on
   row zero, quantizes each adjusted pixel to the nearest color in the complete
   enabled palette. Incoming and outgoing RGB error remain independent and are
   not restricted by a local attribute pair.
2. The guide uses the user's requested diffusion amount and carries the
   permitted BRIGHT plane selected for each pixel.
3. Each attribute cell counts guide palette codes and calculates their weighted
   mean code. It selects the most frequent code, with lower code winning a
   frequency tie, plus the most frequent used code on the opposite side of the
   mean. A one-color cell pairs that color with black when black is enabled.
4. Codes at or beyond the selected endpoints clamp to the respective endpoint.
   Intermediate codes are re-dithered through the frozen 2×2 reference
   pattern according to their palette-index distance below INK.

This preserves the smooth unrestricted dither pattern and the reference
converter's transition behavior while applying the hardware restriction
afterward. Attribute smoothing 0% is the exact reference baseline. Above 0%,
pair selection adds independently configurable horizontal and vertical halos
of 0, 1, or 2 pixels around the cell. Vertical radius is always treated as zero
for 8×1 and 8×2 software attributes. Each halo contribution is multiplied by
the requested percentage, by the fraction of matching RGB palette bits between
that sample and its nearest cell-edge sample, and by a distance weight. Radius
two uses harmonically normalized ring weights of 2/3 and 1/3, extending reach
without doubling the influence of each edge. Compatible transitions therefore
influence the pair while strong opposing edges are protected.
Because the guide uses the requested percentage, error-diffusion attributes may
change when that percentage changes.

Optimizer `zx-guide-reference-halo-v2` retains the same unrestricted-guide and
reference remapping topology but versions stronger neighboring evidence
separately from Halo v1. `attributeHaloInfluence` is an integer from 0 through
400. Zero ignores the halo, 100 is the v1-scale reference point, and the
approved ZX baseline uses 137 with 2 px horizontal and 0 px vertical reach.
The optional strong preset uses 200. Halo samples use full ZX rendered-color squared
distance for palette similarity and adjusted-source RGB discontinuity for edge
attenuation. The total accepted halo mass is capped at 1.5 times the 8×`h`
in-cell sample mass. Radius falloff remains harmonic, screen-edge samples are
clipped, corners are visited once, and vertical radius is zero for 8×1 and 8×2.
Halo v1 continues to use `attributeSmoothing` 0–100 and its original palette-bit
similarity unchanged.

Experimental optimizer `zx-block-dbs-global-v1` begins with the Halo v2
attribute/pixel result. High conversion evaluates the two lowest direct-error
legal pair candidates plus the current pair per cell, then Draft and High run
one and two deterministic mask passes respectively. The atomic move is one bit
inside a legal 2×2 block, or a legal 2×1 block for 8×1 attributes. Passes
alternate forward/reverse cell order and row/column block order. A proposal is
accepted only when it reduces the frozen local objective: symmetric separable
`[1,2,1] × [1,2,1]` RGB reconstruction error plus integer-weighted gradient,
cluster, directional-anisotropy, and source-compensated attribute-boundary
terms. Every committed state is a legal ZX screen.

For ordered dithering above 0%, optimizer
`rc-zx-variable-attribute-high-13` performs a true unrestricted first pass.
The checkerboard and Bayer tables are the OsgDither tables with their one-based
ranks represented internally as zero-based values, without transposition or
phase changes. Within the brightness plane selected for a pixel, the converter
enumerates enabled endpoint color pairs and the matrix's discrete coverage
levels. Candidate mixtures use OsgDither's integer level table:
`floor(floor(level * channel / levels) * amount / 100) +
floor((100 - amount) * 64 / 100)`. The closest RGB mixture selects its endpoint
pair and coverage. A pixel emits the first endpoint when its one-based matrix
rank is greater than the coverage and the second endpoint otherwise.
Red, green, and blue are never thresholded independently, and Ordered dithering
uses no random noise, threshold jitter, or phase scrambling.
Attribute cells then use the same
fewest-replacements rule above and remap only excluded colors. When attribute
smoothing is enabled, the same configurable, similarity- and
distance-weighted halo contributes only to the candidate pair mismatch score;
it does not change matrix phase or the unrestricted ordered guide. Ordered
attribute selection can therefore change when its requested amount or smoothing
settings change.

Either dither method at 0% continues through the ordinary no-dithering path to
retain byte identity with `No dithering`.

Optimizer version `rc-zx-variable-attribute-high-13` retains the prior
`high-5` direct cell-selection branch for no dithering and 0% methods. `Draft` uses the
same continuous pair score and canonical candidate rules but, when both
brightness planes are enabled in `Auto`, evaluates one plane per cell instead
of both. It selects the bright plane when the sum of the maximum RGB channel
across the `8 * h` normalized source pixels is at least `224 * 8 * h`;
otherwise it selects the normal plane. A forced BRIGHT policy or a palette with
colors from only one plane selects that available plane.

## 4. Ordered dithering matrices

Matrix coordinates use `x` increasing right and `y` increasing down, with origin `(0, 0)` at the top-left active pixel.

### 4.1 `checkerboard-2x1`

The logical row is `[0, 1]`. Its phase reverses on successive rows, producing:

```text
0 1
1 0
```

### 4.2 `bayer-2x2`

```text
0 2
3 1
```

### 4.3 `bayer-4x4`

```text
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

### 4.4 `bayer-8x8`

```text
 0 32  8 40  2 34 10 42
48 16 56 24 50 18 58 26
12 44  4 36 14 46  6 38
60 28 52 20 62 30 54 22
 3 35 11 43  1 33  9 41
51 19 59 27 49 17 57 25
15 47  7 39 13 45  5 37
63 31 55 23 61 29 53 21
```

For a matrix containing `N` entries, integer entry `m`, amount `p`, projection
numerator `q = (source - paper) dot (ink - paper)`, and projection denominator
`d = (ink - paper) dot (ink - paper)`, the pixel selects ink exactly when:

```text
2 * 100 * N * q >= d * (100 * N + p * (2 * m + 1 - N))
```

Coordinates are reduced modulo matrix width/height from active-screen origin
`(0,0)`. The comparison uses exact JavaScript integer arithmetic; its maximum
magnitude is below the exact-integer limit. If `d = 0`, paper is selected. At
`p = 0` this reduces exactly to the non-dithered midpoint decision.

Above 0%, ordered dithering uses the unrestricted guide and minimal attribute
remapping described in section 3. Matrix coordinates remain anchored to the
active-screen origin, so neither the threshold phase nor the palette pattern
restarts at an attribute boundary. Independent RGB thresholding preserves
small highlights that need any of the eight enabled base colors. This forms
ordered dithering algorithm version `rc-dither-6`.

## 5. Error diffusion

The unrestricted guide uses whole-frame serpentine Floyd–Steinberg. Row zero
traverses right-to-left; odd rows traverse left-to-right. In traversal
direction, independent RGB residuals use coefficients forward `7/16`,
down-backward `3/16`, down `5/16`, and down-forward `1/16`. Error propagates
across attribute-cell boundaries and is discarded only beyond the 256×192
active-screen boundary.

Each channel uses Java-compatible 32-bit float accumulation. The incoming float
is truncated toward zero before addition to the adjusted 8-bit channel, which
is then clipped to `0..255`. For amount `p`, the base residual is stored as
32-bit float `(adjusted-output) * p / 1600`; each neighbor update is rounded
back to 32-bit float after multiplication and addition. At `p = 0` the ordinary
no-dithering path remains byte-identical to `No dithering`. The independent
full-palette guide and palette-index macro remapping described above form
error-diffusion algorithm version `rc-dither-10`. Optional Error randomization
uses a counter-based, seed-1 integer hash keyed by `(x, y, channel)` to add a
signed perturbation before guide quantization. At 100%, its rounded magnitude
is at most eight sRGB channel units; 0% executes the exact prior path. Ordered
dithering `rc-dither-10` uses the Osg pair/coverage search described above and
does not use this randomizer. The direct
attribute-pair diffusion path is version `rc-dither-3`.

Projected phase-balanced v3 is an additive experimental engine. At Line
suppression 0% it uses the frozen unrestricted v2 Floyd–Steinberg path exactly.
Above 0%, it deterministically redistributes a bounded share of the 16 kernel
weight units among forward and next-row neighbors while preserving total error.
After four same-output pixels in a vertical run, smooth source regions increase
the direct-down coefficient by transferring weight from the forward neighbor.
The choice is coordinate-hashed, adds no nondeterministic state, and does not
activate the run response across source edges whose channel delta exceeds 48.

## 5.1 Geometry baseline

The geometry implementation supports `Fit`, `Fill`, `Crop`, and `Stretch` with
nearest-neighbor, bilinear, and Lanczos-3 resampling. Bilinear is the default
for new settings and the built-in Default preset. Pixel centers are mapped using
`floor(((2 * destination + 1) * sourceSize) / (2 * destinationSize))`, clipped
to the final source sample. `Fit` rounds its contained dimension to nearest with
integer half-up division and places an odd unused pixel on the right or bottom.
`Fill` uses the corresponding aspect-preserving source crop. Its horizontal and
vertical focal positions are integer percentages from 0 through 100; the applicable
crop offset is `round(maximumOffset * focal / 100)`, with positive halves rounded
up. The default is 50% on both axes. Alpha is composited before scaling as
`floor((source * alpha + background * (255-alpha) + 127) / 255)`.

`Crop` stores `x`, `y`, `width`, and `height` as integer pixels of the oriented
source. Width and height are at least one pixel and the complete rectangle remains
inside the oriented source bounds. The selected rectangle is resampled directly to
256×192.

The crop editor renders the complete oriented source fitted inside a logical
256×192 editing surface. Pointer coordinates are mapped from that fitted frame back
to oriented source pixels. Drag selection updates all four numeric fields. Its
aspect policy is `none`, the oriented source ratio, or the 4:3 destination ratio.
Manual Width or Height changes recompute the paired dimension under a lock and
clamp the result to the remaining source bounds. A drag that starts inside the
current rectangle translates it by the pointer delta while preserving Width and
Height and clamping X and Y to the source bounds. A drag that starts outside the
current rectangle replaces it with a newly drawn selection. A double-click inside
the active rectangle clears only the editor's active-selection state. The stored
crop coordinates and converted result remain unchanged; the next drag starts a
new rectangle. Pointer interaction focuses the crop editor. With an active
selection, Arrow keys translate the rectangle by one oriented source pixel per
keypress and use the same boundary clamping as pointer movement.

Source orientation is applied before framing and resampling. Horizontal and
vertical mirrors operate in source coordinates first, followed by clockwise
rotation of 0, 90, 180, or 270 degrees. Orientation settings are explicit
conversion inputs and do not reapply EXIF orientation after decoding.

Bilinear coordinates use 16.16 fixed point at the same pixel centers. For each
axis, let `s` be the source-span divided by the rendered destination span,
represented as 16.16 fixed point and rounded to nearest; the filter scale is
`max(1, s)`. The triangle kernel is
`max(0, 1 - abs(distance) / filterScale)` with support of one filter-scale
source pixel. Enlargement therefore retains ordinary two-sample interpolation,
while minification widens the footprint to low-pass source detail before
subsampling.

Samples beyond the selected source span clamp to that span's nearest edge and
duplicate indices are combined. Per-destination weights are normalized to sum
exactly to Q16 with signed nearest rounding; any residual is applied to the
largest weight, with the first contributor winning a tie. Horizontal
intermediates retain exact channel-times-Q16 integers. The vertical result is
divided once by Q32 with signed nearest rounding and clipped to `0..255`.

Lanczos-3 is scale-aware. For each axis, let `s` be the source-span divided by
the rendered destination span, represented as 16.16 fixed point and rounded to
nearest; the filter scale is `max(1, s)`. Kernel support is `3 * filterScale`
source pixels. Thus enlargement retains the ordinary six-sample support while
minification widens the source footprint to perform the required low-pass
filtering before subsampling.

Kernel values are sampled at 1/256 normalized-pixel intervals, quantized to
signed Q14 integers, and generated from `sinc(x) * sinc(x/3)` for
`abs(x) < 3`; the endpoint is zero. Each source distance is divided by the
filter scale before selecting the nearest table entry. Samples beyond the
selected source span clamp to that span's nearest edge and duplicate indices
are combined. Per-destination contributor weights are normalized to sum
exactly to Q14 with signed nearest rounding; any residual is applied to the
largest-magnitude contributor, with the first contributor winning a tie.

The filter executes as separable horizontal and vertical passes. Horizontal
intermediates retain exact channel-times-Q14 integers without clipping. The
vertical result is divided once by Q28 with signed nearest rounding and clipped
to `0..255`. Together with scale-aware bilinear minification, this is geometry
algorithm version `rc-geometry-3`.

## 5.2 Image filters and adjustments

Spatial filters run after resampling and before color adjustments. `Smoothing` and
`Sharpening` are integer percentages from 0 through 100 with neutral value 0.
Both operate on RGB channels only and preserve alpha. Source indices outside the
256×192 image clamp to the nearest edge pixel.

The shared blur sample is the integer 3×3 Gaussian kernel
`[1 2 1; 2 4 2; 1 2 1] / 16`, rounded to nearest. Smoothing blends each original
channel `C` with its blurred channel `B` as
`round((C * (100-smoothing) + B * smoothing) / 100)`. Sharpening runs on the
smoothed result and applies deterministic unsharp masking as
`clip(C + round((C-B) * sharpening / 100))`. A neutral filter stage is
byte-identical to its input.

Color adjustments then run in this fixed order: brightness, contrast,
saturation, then gamma. Brightness, contrast, and saturation are integer values
from -100 through 100 with neutral value 0. Gamma is an integer percentage from
33 through 300 with neutral value 100. Every intermediate channel is clipped to
0..255 and signed divisions round to nearest with halves away from zero.

Brightness adds `round(255 * brightness / 100)`. Contrast then maps each channel
as `128 + round((channel - 128) * (100 + contrast) / 100)`. Saturation uses
integer luma `round((77R + 150G + 29B) / 256)` and maps each channel as
`luma + round((channel - luma) * (100 + saturation) / 100)`.

At neutral 100%, gamma is byte-identical to its input. At every other setting
`g`, each channel `C` is mapped with the reference-compatible power response
`clip(floor((C / 255)^(100 / g) * 256))`. This deliberately retains the
reference application's 256 multiplier and final 8-bit clipping.

## 6. Controlled sRGB policy

- Sources without an embedded ICC profile are interpreted as sRGB.
- General-purpose ICC conversion is not implemented in v1.0.
- Exact accepted embedded sRGB profile hashes and PNG color-declaration behavior remain `TBD` pending codec selection and conformance fixtures.
- Any unrecognized embedded ICC profile is rejected atomically.

## 7. Determinism

- `.scr` bytes and decoded preview pixels are byte-identical across the supported matrix.
- Deterministic metadata fields are compared semantically after JSON parsing.
- Every arithmetic rule affecting output must define operation order, intermediate representation, clipping, and rounding before implementation acceptance.

## 7.1 Transactional Draft and High workflow

Every valid source or setting revision schedules a Draft conversion after a 300 ms
debounce. A newer revision cancels the prior Draft worker and ignores any response
whose revision no longer matches. Draft output may replace the visible preview but
is never exportable.

High conversion is always explicit. Its result becomes exportable only when it
finishes for the current revision. If settings change while High is running, that
job is cancelled; if a response is superseded, it is ignored. A previously completed
High result remains visible while later work runs, but becomes stale and non-exportable
as soon as its source or settings revision changes. Manual High cancellation preserves
the current preview and any prior completed result.

## 7.2 Artifact export baseline

Only a current completed High result exposes artifact actions. Immediately before any
artifact is generated, its size-specific `.scr` is independently validated. Validation
failure blocks the action without discarding the source or completed result.

The `.scr`, exact 256×192 RGBA preview encoded as static PNG, and UTF-8 metadata JSON
are separate explicit downloads. Their deterministic base name is derived from the
source name by removing its last extension, applying Unicode NFKD normalization,
removing non-ASCII characters, replacing unsafe or separator runs with `-`, trimming,
limiting to 64 characters, protecting Windows reserved device names, and falling back
to `retro-converter` when empty.

Metadata schema `1.0.0` records complete settings, source/SCR/decoded-preview SHA-256
hashes, the built-in profile identity and hash, all attribute bytes as lowercase hex,
algorithm identifiers, quality score, validation result, and preview calibration.
The High completion timestamp is informational and excluded from the declared
deterministic projection. Source pixels, original filenames, paths, and user identity
are excluded.

## 8. Open controlled decisions

- Normative PNG/JPEG decoder and exact supported feature subset
- Accepted sRGB profile allow-list
- ZX palette values and canonical black encoding
- Framing and resampling arithmetic
- Adjustment ranges and arithmetic
- Cell color-distance function and optimizer bounds
- Dithering normalization and fixed arithmetic
- Quality metric formula and release thresholds
