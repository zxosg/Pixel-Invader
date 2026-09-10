# Pixel Invader

Pixel Invader is an Image Convertor powered by Void Engine and OSG^Invaders. It is
a local-only browser application for deterministic conversion
of static images into ZX Spectrum 48K, Sinclair QL, and Tesla PMD 85
screen-memory files.

The authoritative product baseline is [RC-SRS-001 draft.3](./Retro_Converter_SRS_v1.0-draft.3.md). The phased delivery plan is documented in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Development

### Easiest way on this Mac

Open Terminal, paste the following command, and press Return:

```sh
cd /Users/jan/GitHub/OsgConvert
./tools/run-dev.sh
```

The browser opens automatically when the server is ready. If it does not, open
the address printed by Terminal, normally:

```text
http://localhost:5173/
```

While the server is running, type `o` and press Return to open its current
address again. Vite may choose another port when `5173` is already in use; the
shortcut always opens the active address.

Choose a PNG or JPEG, target profile, framing, resampling, palette, and dithering
settings, then click **Convert High**. ZX profiles also provide attribute and
BRIGHT controls; the Sinclair QL profile provides Low/Mode 8 and High/Mode 4,
each as either a basic single-screen conversion or a two-screen mixed-color
conversion.

```text
Completed final · 6,912 / 6,912 bytes · 8×8 attributes.
```

Use **Binary .scr** for ZX output. Basic QL modes export one screen binary;
mixed QL modes export two alternating screen binaries and provide a fixed 50/50
merged preview.

PMD 85 profiles support all six hardware interpretations, calibrated palettes,
288×256 previews, and exact 16 KiB binary import/export. Imported PMD files can
be reinterpreted without changing their source bytes. PMD 85-2 TV/CV blink bits
are displayed as static Bright/Dim intensity and preserved by unchanged export;
blink animation is intentionally unsupported.

Press **Control-C** in Terminal to stop the application.

### Run automated tests

```sh
cd /Users/jan/GitHub/OsgConvert
./tools/run-tests.sh
```

A successful run reports the current test-file and test totals.

### Build the production application

```sh
cd /Users/jan/GitHub/OsgConvert
./tools/run-build.sh
```

The production files are written to `apps/web/dist`.

### Standard package-manager commands

The project uses a pnpm workspace and requires a recent Node.js runtime. If Node.js and pnpm are installed normally, these commands are equivalent:

```sh
pnpm install
pnpm check
pnpm build
```

## Current milestone

The current vertical slice implements safe PNG/JPEG decoding, EXIF orientation,
deterministic Fit/Fill/Crop/Stretch framing with Fill focal positioning and
nearest-neighbor, scale-aware anti-aliased bilinear, or scale-aware anti-aliased
Lanczos-3 resampling (bilinear is the default),
deterministic rotation and
horizontal/vertical mirroring, deterministic brightness, contrast, saturation,
gamma, Gaussian smoothing, and unsharp sharpening adjustments, exhaustive ZX
attribute-cell conversion with selectable
8×8, 8×4, 8×2, and 8×1 software modes, BRIGHT Auto/On/Off, selectable palette colors,
continuous dither-independent attribute-pair optimization, no dithering, all four
ordered matrices, whole-frame serpentine fixed-point Floyd–Steinberg error
diffusion, automatic debounced Draft previews, transactional explicit High jobs,
stale-result suppression, cancellation, converted preview, `.scr` validation,
deterministic filenames, and explicit binary, preview PNG, and metadata JSON downloads.
Conversion engines have immutable IDs: attribute optimizers and dither engines can
be selected independently and compared with the on-demand benchmark table.
The `Structured edge-preserving` preset selects the compatible-only
`zx-structured-global-v4` and `ordered-cell-pattern-v4` pair. It globally
coordinates ZX attribute pairs, scores only physically realizable 2×2 patterns
(2×1 in 8×1 mode), and defines 0% as the exact independent-pixel endpoint
baseline. Structured scoring uses quantized OKLab integers and versioned
linear-light mixture and response models; its component costs are included in
conversion metadata. Its pre-attribute tab is an independently optimized
palette-constrained ordered guide rather than an unchanged optimizer input.
The immutable Version 1 through Version 3 pairs remain available for benchmarking.
Version 2 corrected the pixel-dominant objective; Version 3 adds a source-RGB
color anchor so complementary pairs cannot win solely because their average
matches the source brightness. Version 4 adds separate nearest-palette label and
unrestricted ordered-pattern references, palette-occupancy, luminance-rank and
edge-polarity costs, local candidate admissibility, and capped boundary influence.
The last selected optimizer and dither engine are retained as local preferences
and restored at the next application start.
`Reference guide + stronger halo v2` preserves Halo v1's unrestricted guide
topology while extending neighbor influence to 400%, with edge attenuation and
a bounded evidence cap. The visually approved ZX baseline uses 137% influence,
2 px horizontal and 0 px vertical reach; a separate strong preset retains 200%.
Immutable Halo v1 is the production baseline; Halo v2 remains available for
regression and visual comparison. Experimental RGB-guarded Halo v3 accepts only
full-preview RGB improvements or RGB-neutral boundary improvements.
Gamma adjustment spans 33–300%, extending both darkening and lightening strength
by at least 50% while retaining 100% as the neutral point.
New conversions default to the guide-consistent `none-discrete-v2` engine; the
historical continuous-pair `none-v1` implementation remains selectable for
reproduction and benchmark comparison.
The latest Error-diffusion engine is `error-diffusion-decorrelated-v3`. It uses
a deterministic two-row Stucki kernel plus effective randomization on both ZX
and QL to reduce Floyd–Steinberg worms and long vertical columns. Versions 1 and
2 remain available unchanged. The main Dithering panel exposes a dedicated
Error diffusion method selector for Decorrelated, Atkinson, Projected,
Unrestricted, experimental Projected phase-balanced v3, and ZX-only Riemersma
engines; switching methods retains the last compatible engine, amount,
randomization, and ordered matrix for each family. Phase-balanced v3 retains
the projected method's short 2×1 transitions while deterministically varying
error phase and strengthening same-column corrective feedback after long runs
in smooth areas.
Its Line suppression control is 0–100%; 0% is byte-identical to unrestricted
v2 and the default experimental strength is 50%.
The approved ZX production baselines pair Halo v1 with Decorrelated error
diffusion v3 or Ordered strict-matrix v6. Both built-in presets use the
Agony-18 calibration of 38% dither and the 2 px/0 px halo configuration;
image adjustments and BRIGHT remain neutral/Auto.
Engine comparison can optionally include experimental low-resolution methods:
clustered-dot and isotropic fixed-threshold patterns, Atkinson and Riemersma
diffusion, and a deterministic legal-mask block optimizer initialized from Halo
v2. Advanced selectors group recommended, historical, and experimental engines.
The comparison table groups digest-identical outputs, reports exact, low-pass,
edge and attribute-boundary metrics, labels Pareto tradeoffs, supports A/B
previews and difference heatmaps, and exports versioned JSON or CSV. Multiple
JSON exports can be summarized with `pnpm benchmark:corpus <files...>`.
Benchmarks also report directional anisotropy, long straight residual runs,
low-frequency noise, local error clumping, and edge displacement. These metrics
provide visual-quality guidance without replacing canonical RGB ranking, while
user-marked visual favorites are preserved in JSON and CSV exports.
Tilemap conversion keeps Image similarity v2 as its interactive default and v4
as the exhaustive maximum-quality option. Experimental v5 starts from v2,
contextually rechecks only the worst 10% of cells, and accepts the bounded pass
only when canonical decoder RGB error improves by at least 0.1%.
The latest Ordered engine uses exhaustive palette-pair and matrix-coverage
selection for ZX and plain QL, so equivalent QL Mode 8 and ZX BRIGHT ON
pre-constraint guides use the same ordered model. Mixed QL starts from its exact
no-dither virtual-palette result and adds ordered coverage progressively as the
amount increases. The current strict-matrix v6 engine never extends the spatial
period beyond the selected matrix. Consequently, small matrices have coarse
representable coverage and may remain unchanged through low percentage ranges;
representing intermediate coverage would require a larger period or noise.
`Artistic ordered hybrid v1` is experimental. Its shared attribute-free core
places canonical color pairs through nested checkerboard, horizontal, or
vertical motifs. A fixed-seed void-and-cluster rank order fills the gaps between
quarter coverage levels without restarting phase at hardware boundaries. Plain
QL Mode 8 and Mode 4 use unrestricted palette pairs directly. ZX uses Bayer
4×4's Halo-selected legal pairs and reconstructs a continuous target color from
the guide over a sliding Bayer period; strong contours retain Bayer placement.
No residual, per-cell quota, or post-threshold pixel move is applied. At 0% it
follows the normal discrete no-dither path byte-for-byte. It supports ZX 8×1,
8×2, 8×4, and 8×8 software attribute cells plus plain QL targets; it rejects
PMD, mixed QL, vertical-spatial QL, and mixed ZX targets; and offers `Auto`,
`Checkerboard`, `Horizontal`, and `Vertical` pattern preferences. Its fixed
effective seed is persisted in conversion metadata.
Error diffusion uses its unrestricted v2 guide by default. Historical engines,
including the experimental hierarchical v5, remain selectable for benchmarks.
The preview exposes adjusted source, pre-constraint dither, physical screen frames,
and merged output.

ZX Spectrum also supports an optional two-screen mixed target. The unrestricted
stage quantizes into the 50/50 temporal palette, then each endpoint screen is
independently constrained to legal ZX bitmap and attribute data. Temporal
endpoint order alternates by complete attribute cell—not by pixel—so the mode
does not introduce a checkerboard assignment that ZX attributes cannot encode.
This balancing is optional through `Screen flicker suppression`; disabling it
keeps fixed endpoint order. The same control governs QL mixed modes at pixel
level, where enabled retains the existing checkerboard endpoint assignment.
Both `.scr` files and the merged perceived PNG are exported and retained in
projects.

The Sinclair QL profile supports direct hardware-palette conversion to one
validated 32 KiB screen and mixed-color conversion to two screens, in either
256×256 Mode 8 or 512×256 Mode 4. Mode 8 FLASH bits are always clear; mixed
screens use deterministic alternating color-pair assignment and a 50/50 merged preview.
QL Ordered dithering distributes coverage between virtual palette colors using
the selected matrix and amount. The current strict-matrix v6 engine preserves
the no-dither mixed result at 0%, uses only the selected matrix period, and
retains exhaustive v4 behavior for plain hardware modes. Baseline-additive v5,
exhaustive v4, local-tone v3, and unrestricted v2 remain available for
reproduction. Error diffusion scales propagated error by the same retained
amount. Output-stage
selection is retained while conversion parameters change,
so inspection remains on Merged instead of temporarily exposing a physical
screen's intentional temporal pair-balancing pattern.
Fit uses the profile's historical 4:3 display proportion for both QL modes and
ZX Spectrum. The inspection workspace adds synchronized native logical-pixel
1:1 through 8:1 zoom and pan, source/result
comparison, pixel and variable-height attribute grids, pointer and keyboard cell
inspection, palette-use visualization, border selection, and diagnostic JSON export.

Completed High results can also be saved as validated, self-contained v2 `.rccproject`
archives and reopened with full hash and reproduction checks. Declarative profiles and
complete presets are validated and locally retained on explicit import. The production
application shell is installable and works offline after its first successful load.

Undo/redo is deferred by product decision. Independent cross-browser goldens, parser
fuzzing, and final release approval remain release-hardening work.

## License

MIT
