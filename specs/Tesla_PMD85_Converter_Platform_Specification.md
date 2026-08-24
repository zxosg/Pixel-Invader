---
title: Tesla PMD 85 Display Platform
subtitle: Platform implementation specification
version: 1.0.0
date: 2026-08-01
---

# Tesla PMD 85 Display Platform

*Platform implementation specification for PMD 85-2 / 2A, PMD 85-3, and ColorAce converter support*

| Document field | Value |
|---|---|
| Status | Implementation-ready baseline; palette calibration remains user-tunable |
| Revision | 1.0.0 |
| Date | 1 August 2026 |
| Target | OsgConvert / Pixel Invader conversion architecture |

> **Platform decision:** Implement one new `pmd-85` platform with a shared 16 KiB VRAM codec and mode-specific attribute decoders.

# Purpose and scope

This document supplies the platform-level information required to add Tesla PMD 85 support to the converter. It defines the machine revisions, hardware modes, palettes, screen-memory layout, raw export contract, conversion constraints, preview behavior, built-in profiles and verification tests. It covers stock PMD 85-2 / 2A and PMD 85-3 video behavior plus the ColorAce hardware modification.

> **Architectural boundary:** A profile JSON is not sufficient. The existing platform union, conversion worker dispatch, core codec, project metadata and UI mode controls must all gain a pmd-85 implementation. Profiles then select one of the built-in PMD modes.

# Recommended built-in profiles

| **Profile**           | **Stable ID**                            | **Mode ID**    | **Cell** | **Attribute model**        |
|-----------------------|------------------------------------------|----------------|----------|----------------------------|
| PMD 85-2 / 2A TV/CV   | org.retroconverter.tesla.pmd85-2.tv      | pmd85-2-tv     | 6×1      | Bright/dim; optional blink |
| PMD 85-2 / 2A RGB mod | org.retroconverter.tesla.pmd85-2.rgb-mod | pmd85-2-rgb    | 6×1      | Green/yellow/cyan/white    |
| PMD 85-3 PAL          | org.retroconverter.tesla.pmd85-3.pal     | pmd85-3-pal    | 6×1      | White/green/red/brown      |
| PMD 85-3 RGB          | org.retroconverter.tesla.pmd85-3.rgb     | pmd85-3-rgb    | 6×1      | Green/red/blue/magenta     |
| PMD 85 ColorAce       | org.retroconverter.pmd85.colorace.rgb    | pmd85-colorace | 6×2      | Seven inks on black        |

**Default profile:** PMD 85-3 RGB. All profiles begin at semantic version 1.0.0 and share platform ID pmd-85.

# Computer models and display characteristics

| **Target** | **Revision**     | **Relevant memory**           | **Converter significance**                                                             |
|------------|------------------|-------------------------------|----------------------------------------------------------------------------------------|
| PMD 85-2   | 1986             | 48 KiB RAM; 4 KiB Monitor ROM | Same 288×256 VRAM encoding as 2A                                                       |
| PMD 85-2A  | 1987             | 64 KiB RAM; 4 KiB Monitor ROM | Video-compatible with PMD 85-2                                                         |
| PMD 85-3   | 1988             | 64 KiB RAM; 8 KiB Monitor ROM | Same VRAM geometry; revised attribute/output decoding                                  |
| ColorAce   | Community add-on | GAL-based video modification  | Pairs attributes from adjacent scanlines; supported implementations exist for 2A and 3 |

- Native logical raster: 288 × 256 pixels.

- Framebuffer count: one. No double buffer, alternate screen or multi-frame file structure is encoded.

- Native attribute cell: 6 × 1 pixels. ColorAce attribute cell: 6 × 2 pixels.

- Background/pixel-off color is always black. Attributes select only the foreground/pixel-on color or intensity.

- No programmable palette, per-line bank, transparency or border-color register is part of the screen encoding.

- The stored image has no interlace, scanline or overscan metadata. Treat it as a single progressive logical raster for conversion and preview.

# Screen-memory format

Video RAM occupies the final 16 KiB address window, 0xC000–0xFFFF. Each of 256 scanlines consumes a 64-byte stride. Only the first 48 bytes are displayed; the final 16 bytes are not scanned out and historically serve as system or program scratch storage. The visible payload is therefore 256 × 48 = 12,288 bytes and the interleaved non-visible area is 4,096 bytes. \[S1\]

| **Property**      | **Definition**                                                    |
|-------------------|-------------------------------------------------------------------|
| Base address      | 0xC000                                                            |
| Address span      | 0xC000–0xFFFF inclusive (16,384 bytes)                            |
| Rows              | 256, ordered top to bottom                                        |
| Physical stride   | 64 bytes per row                                                  |
| Visible bytes     | Offsets 0–47 of each row                                          |
| Non-visible bytes | Offsets 48–63 of each row                                         |
| Last visible byte | 0xFFEF (row 255, column byte 47)                                  |
| Byte endianness   | Not applicable; byte-oriented raw image with no multi-byte fields |

```text
address(y, byteX) = 0xC000 + y * 64 + byteX
0 <= y < 256
0 <= byteX < 48
x = byteX * 6 + pixelBit
```

## One VRAM byte

| **Bit** | **Role**        | **Displayed position / meaning**       |
|---------|-----------------|----------------------------------------|
| 7       | Attribute bit 1 | Most-significant attribute bit         |
| 6       | Attribute bit 0 | Least-significant attribute bit        |
| 5       | Pixel 5         | Rightmost pixel of the six-pixel group |
| 4       | Pixel 4         |                                        |
| 3       | Pixel 3         |                                        |
| 2       | Pixel 2         |                                        |
| 1       | Pixel 1         |                                        |
| 0       | Pixel 0         | Leftmost pixel of the six-pixel group  |

> **Critical bit-order rule:** Pixels are LSB-first on screen. Bit 0 is the leftmost pixel and bit 5 is the rightmost. This must be covered by an explicit codec test because it is the opposite of many retro bitmap formats.

# Native attribute encoding

For stock modes, `attr = byte >> 6` applies to all six pixel bits in that byte. A cleared pixel is black; a set pixel uses the selected foreground. The same stored attributes are decoded differently by each output circuit. The PMD 85-3 mapping below is stated in the original operating manual; the PMD 85-2 TV/CV behavior and RGB colors are documented by the PMD 85 Infoserver and hardware notes. \[S1\]\[S2\]\[S9\]

| **Bits 7–6** | **PMD 85-2 TV/CV** | **PMD 85-2 RGB mod** | **PMD 85-3 PAL/video** | **PMD 85-3 RGB** |
|--------------|--------------------|----------------------|------------------------|------------------|
| 00           | Bright             | Green                | White                  | Green            |
| 01           | Dim                | Yellow               | Green                  | Red              |
| 10           | Bright + blink     | Cyan                 | Red                    | Blue             |
| 11           | Dim + blink        | White                | Brown                  | Magenta          |

> **PMD 85-2 RGB qualification:** The four-color RGB target represents the documented RGB modification/monitor path. Stock TV/CV use is effectively monochrome with brightness and blink, and the original color/blink circuitry is not a clean plug-and-play consumer RGB mode.

## Blink behavior

In the PMD 85-2 TV/CV interpretation, attribute bit 7 selects blinking. During the off phase, pixel-on locations using attributes 10 or 11 render as black. The GPMD85 emulator toggles the blink state every 500 ms (approximately a 1 Hz complete on/off cycle). Use that timing as the deterministic preview default, but keep it configurable because original RC timing can vary. PMD 85-3 native color modes and ColorAce do not use blink. \[S5\]\[S6\]

# ColorAce attribute encoding

ColorAce retains the 16 KiB framebuffer and six pixel bits per byte, but combines the two-bit attributes from an even scanline and the following odd scanline. The resulting foreground color applies to all twelve pixel positions in the 6 × 2 cell; the upper and lower six-bit masks remain independent. Swapping the two scanline attributes does not change the color. \[S3\]\[S4\]\[S5\]

| **Ink** | **Even attr** | **Odd attr** | **Mix index** | **Editor RGB** |
|---------|---------------|--------------|---------------|----------------|
| Green   | 00            | 00           | 4             | **\#00FF00**   |
| Red     | 01            | 01           | 1             | **\#FF0000**   |
| Blue    | 10            | 10           | 2             | **\#0000FF**   |
| Magenta | 11            | 11           | 3             | **\#FF00FF**   |
| Yellow  | 01            | 00           | 5             | **\#FFFF00**   |
| Cyan    | 10            | 00           | 6             | **\#00FFFF**   |
| White   | 11            | 00           | 7             | **\#FFFFFF**   |

## Complete ColorAce pair matrix

| **Even \\ Odd** | **00** | **01**  | **10**  | **11**  |
|-----------------|--------|---------|---------|---------|
| 00              | Green  | Yellow  | Cyan    | White   |
| 01              | Yellow | Red     | White   | Magenta |
| 10              | Cyan   | White   | Blue    | Magenta |
| 11              | White  | Magenta | Magenta | Magenta |

```text
a0 = (evenByte >> 6) & 3
a1 = (oddByte >> 6) & 3
mixIndex = (a0 | a1) | ((a0 & a1) != 0 ? 0 : 4)
palette = [black, red, blue, magenta, green, yellow, cyan, white]
```

> **Physical restriction:** ColorAce is not an unrestricted eight-color bitmap. Every 6 × 2 cell contains black plus at most one of seven foreground colors.

# Palette and preview calibration

The hardware documents define logical colors and analog output behavior, not authoritative measured sRGB coordinates. Conversion still requires RGB values, so built-in palettes must be explicit calibration presets rather than claims of universal physical truth. The recommended baseline below reproduces the GPMD85 emulator's softened bright palette; ColorAce additionally offers the pure RGB values used by its reference editor. Users should be able to import measured/calibrated palettes later. \[S4\]\[S5\]\[S6\]

| **Logical color** | **Reference sRGB** | **Use**                                       |
|-------------------|--------------------|-----------------------------------------------|
| Black             | **\#000000**       | Pixel-off/background                          |
| White             | **\#FFFFFF**       | Full white                                    |
| Silver            | **\#BFBFBF**       | PMD 85-2 reduced brightness                   |
| Lime/green        | **\#50FF50**       | Bright green                                  |
| Red               | **\#FF5050**       | Bright red                                    |
| Blue              | **\#5050FF**       | Bright blue                                   |
| Yellow            | **\#FFFF50**       | Bright yellow                                 |
| Cyan/aqua         | **\#50FFFF**       | Bright cyan                                   |
| Magenta/fuchsia   | **\#FF50FF**       | Bright magenta                                |
| Brown/maroon      | **\#A00000**       | PMD 85-3 video attr 11 emulator approximation |

- Default for PMD 85-2 TV/CV: white/silver neutral monitor preview; optional green-monitor preset.

- Default for PMD 85-2 RGB, PMD 85-3 PAL and PMD 85-3 RGB: GPMD85 emulator-calibrated colors above.

- Default for ColorAce: pure editor RGB; offer GPMD85-softened as an alternate named palette.

- Perform resampling, mixing and error diffusion in linear light; convert to the perceptual working space only for scoring.

# Export and import contract

| **Field**        | **Definition**                                   |
|------------------|--------------------------------------------------|
| Default filename | screen.bin                                       |
| Extension        | .bin                                             |
| Container        | Raw 16 KiB memory image for 0xC000–0xFFFF        |
| Header / magic   | None                                             |
| Metadata         | None                                             |
| Compression      | None                                             |
| Checksum         | None in file                                     |
| Alignment        | Exactly 256 records × 64 bytes                   |
| Screens per file | One                                              |
| Load address     | 0xC000, supplied externally to a loader/emulator |

This contract matches the ColorAce editor, which accepts exactly 16,384 bytes and exports screen.bin, and the GPMD85 emulator's raw memory-block facility when used with address 0xC000. A tape-ready PTP container is a separate future exporter because it requires a loader/container specification not present in the raw screen format. \[S4\]\[S7\]

## Policy for the 16 non-visible bytes per row

- New conversion: write zero to every non-visible byte for deterministic output and compatibility with ColorAce editor files.

- Imported 16 KiB image: preserve non-visible bytes by default during edit/re-export; offer an explicit Sanitize gaps option to zero them.

- Decoder: never interpret the gap bytes as pixels or attributes.

- Runtime loader warning: copying the full 16 KiB over a live machine may overwrite Monitor/BASIC/program scratch data. A safe viewer loader should copy only the first 48 bytes of each 64-byte row unless the complete memory image is intentionally required.

## Reference encoder

```text
out = Uint8Array(16384) // initialized to zero
for y in 0..255:
  for byteX in 0..47:
    mask = 0
    for p in 0..5:
      if pixelOn[y][byteX*6+p]: mask |= 1 << p
    out[y*64 + byteX] = mask | (attribute[y][byteX] << 6)
// out[y*64+48 .. y*64+63] remains zero
```

# Conversion rules

The converter must optimize directly against the legal PMD cells. Converting first to an unrestricted palette and assigning attributes afterward will create avoidable seams and color errors. The no-dither path and all dithered paths must share the same hardware-aware candidate evaluator.

1.  Resample and frame the source to 288 × 256 using the selected geometry policy. Keep working RGB values in linear light.

2.  Partition the target into 6 × 1 native cells or 6 × 2 ColorAce cells.

3.  For each legal foreground, determine the on/off mask that minimizes the per-pixel objective against black and that foreground.

4.  Choose the foreground and mask with the lowest total error, including optional edge/seam terms and the requested dithering contribution.

5.  Encode the chosen six-bit masks LSB-left and write the canonical attribute or ColorAce pair.

6.  Run the decoder on the generated bytes and use the decoded image for result preview and regression comparison.

## Cell objectives

- Native cell: evaluate 4 foreground attributes and six independent on/off pixel decisions. In PMD 85-2 TV static mode, attributes 10 and 11 are excluded unless blink is explicitly enabled.

- ColorAce cell: evaluate 7 foreground colors and twelve independent on/off pixel decisions, then encode the selected canonical pair across even/odd rows.

- For an additive per-pixel objective, exhaustive mask enumeration is unnecessary: choose black versus ink independently for each pixel, then sum the errors. Restricted mask search is needed only when pattern regularity or neighborhood terms are enabled.

- Score color in a perceptual space such as OKLab or CIE Lab, but preserve energy operations and temporal mixing in linear RGB.

## Dithering presets

| **Method**              | **Suggested amount** | **Behavior**                                                                                                                   |
|-------------------------|----------------------|--------------------------------------------------------------------------------------------------------------------------------|
| None                    | 0% amount            | Exact hardware-aware no-dither baseline; deterministic and required for regression tests.                                      |
| Ordered 4×4             | 25–70%               | Stable, regular patterns; useful for flat areas and predictable output.                                                        |
| Blue-noise threshold    | 25–80%               | More homogeneous texture with fewer directional artifacts; suitable as an optional high-quality preset.                        |
| Serpentine 2D diffusion | 40–100%              | Diffuse vector error to future X/Y neighbors; normalize kernel weights and prevent propagation across excluded/cropped pixels. |

> **Dithering amount contract:** At 0%, output must exactly equal the no-dither baseline. Higher values scale the threshold/error-feedback contribution; they must not silently change palette calibration, resampling or legal cell candidates.

## Blink-aware optimization

Blink should be disabled by default for still-image conversion. If enabled, evaluate both preview phases and add a strong flicker penalty. The temporal-average target must be computed in linear light, not by averaging encoded RGB values. This prevents the optimizer from choosing a flashing bright attribute merely to imitate a static midtone.

# Preview behavior

| **Preview property** | **Required behavior**                                                                                                                         |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| Raster               | Decode generated bytes; do not preview an unconstrained intermediate image.                                                                   |
| Border               | Black. Optional decorative CRT margin is UI-only and not exported.                                                                            |
| Pixel aspect         | Default 1:1, matching GPMD85 and ColorAce editor logical rendering.                                                                           |
| Display aspect       | 288:256 (9:8) for the active raster. Optional CRT framing may place it inside a 4:3 viewport without altering bytes.                          |
| 4:3 stretch option   | If users explicitly stretch the active raster to 4:3, use PAR 32:27. Mark this as a display approximation, not a verified timing measurement. |
| Scanlines            | Off by default; optional visual filter only.                                                                                                  |
| PMD 85-2 blink       | Animate 500 ms on / 500 ms off by default; also provide On phase, Off phase and Average inspection views.                                     |
| ColorAce             | Static; pair even/odd line attributes before drawing either line.                                                                             |

> **Calibration gap:** No authoritative measured RGB/XYZ palette or exact active-area timing was found in the reviewed sources. Keep palettes and CRT geometry calibratable and do not label the default sRGB values as measured hardware colors.

# Default profile settings

| **Setting** | **Default**                                                                      |
|-------------|----------------------------------------------------------------------------------|
| Platform    | pmd-85                                                                           |
| Profile     | org.retroconverter.tesla.pmd85-3.rgb                                             |
| Version     | 1.0.0                                                                            |
| Mode        | pmd85-3-rgb                                                                      |
| Canvas      | 288 × 256; square-pixel active-raster preview                                    |
| Framing     | Contain; black fill; centered                                                    |
| Resampling  | Use the converter's existing high-quality downscale default; otherwise Lanczos-3 |
| Palette     | GPMD85 emulator RGB calibration                                                  |
| Dithering   | Serpentine 2D diffusion, 70% amount                                              |
| Export      | screen.bin; 16,384 bytes; zero-filled gaps                                       |

Recommended named presets:

- PMD 85-3 RGB - Balanced

- PMD 85-3 PAL - Composite colors

- PMD 85-2 TV - Static grayscale

- PMD 85-2 RGB modification

- ColorAce - Pure editor palette

- ColorAce - Emulator-soft palette

- No dither - Exact cell baseline

# Machine-readable profile sketch

```json
{
  "id": "org.retroconverter.tesla.pmd85-3.rgb",
  "version": "1.0.0",
  "platform": "pmd-85",
  "mode": "pmd85-3-rgb",
  "canvas": {
    "width": 288,
    "height": 256,
    "pixelAspect": 1.0,
    "borderColor": "#000000"
  },
  "memory": {
    "baseAddress": "0xC000",
    "byteLength": 16384,
    "rows": 256,
    "stride": 64,
    "visibleBytesPerRow": 48,
    "pixelOrder": "lsb-left"
  },
  "attributeCell": {
    "width": 6,
    "height": 1,
    "background": "black",
    "foregroundMap": [
      "green",
      "red",
      "blue",
      "magenta"
    ]
  },
  "export": {
    "extension": ".bin",
    "format": "raw-vram-16k",
    "headerBytes": 0,
    "gapPolicy": "zero-new-preserve-imported"
  }
}
```

This sketch is a proposed built-in profile payload. Exact property names should follow the existing project schema; platform and mode IDs are the normative decisions in this document.

# Implementation integration map

| **Integration point** | **Required change**                                                                                                                    |
|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| Platform types        | Extend packages/conversion-core/src/types.ts with platform pmd-85 and a Pmd85ModeId union.                                             |
| Core codec            | Add raw 16 KiB encoder/decoder, gap policy, bit-order tests and ColorAce pair logic.                                                   |
| Converter             | Add native 6×1 and ColorAce 6×2 cell evaluators with shared resampling/dithering infrastructure.                                       |
| Profiles              | Register the five built-in profiles in apps/web/src/profiles.ts; keep palette calibration profile-owned.                               |
| Worker                | Extend apps/web/src/worker/conversion.worker.ts dispatch to route pmd-85 to the new converter.                                         |
| UI                    | Expose hardware mode, palette calibration, blink allowance/preview and gap export policy.                                              |
| Projects/metadata     | Persist platform ID, mode ID, profile ID/version, palette calibration and export policy.                                               |
| Import/export         | Accept exactly 16,384-byte .bin files; decode mode must be user-selected because bytes do not identify their attribute interpretation. |

## Suggested core types

```ts
type PlatformId = 'zx-spectrum' | 'sinclair-ql' | 'pmd-85';

type Pmd85ModeId =
  | 'pmd85-2-tv'
  | 'pmd85-2-rgb'
  | 'pmd85-3-pal'
  | 'pmd85-3-rgb'
  | 'pmd85-colorace';

interface Pmd85ModeDefinition {
  id: Pmd85ModeId;
  attributeWidth: 6;
  attributeHeight: 1 | 2;
  attributeModel: 'native' | 'colorace-pair';
  allowBlink: boolean;
}
```

# Verification package

The ColorAce editor includes Magicland Dizzy as a built-in raw screen. It is a suitable first codec fixture because it exercises the 16 KiB layout, LSB-left pixel order, scanline pairing and all ColorAce color logic. \[S4\]\[S8\]

| **Check**              | **Expected value**                                               |
|------------------------|------------------------------------------------------------------|
| Fixture                | magicland.bin                                                    |
| Source                 | ColorAce editor built-in screen database                         |
| File size              | 16,384 bytes                                                     |
| SHA-256 (file)         | 1f442feedd069d330c3728e5ee831b67b4a5f1db83f5d5b06d706a23213bf7eb |
| Non-visible gap bytes  | 4,096 bytes; all zero in this fixture                            |
| Decoded raster         | 288 × 256, pure ColorAce editor palette                          |
| SHA-256 (decoded RGBA) | 124fc62c10438650f6005c3321e83f3f1ef1de488be5227d4cdccd01fa4ff5ee |

The expected image is a 288 × 256 decode of [`magicland.bin`](https://pmd85.borik.net/colorace/screen.db/magicland.bin) using the pure ColorAce editor palette. Nearest-neighbor scaling must preserve source pixels. The binary and decoded RGBA hashes above are the normative automated-verification values.

## Required automated tests

| **Test group**     | **Acceptance condition**                                                                                         |
|--------------------|------------------------------------------------------------------------------------------------------------------|
| Geometry           | All-zero file decodes to 288 × 256 black; encoder always produces 16,384 bytes.                                  |
| Addressing         | Row 0 visible bytes map to 0xC000–0xC02F; row 1 to 0xC040–0xC06F; final visible byte is 0xFFEF.                  |
| Bit order          | Byte 0x01 lights the leftmost pixel; byte 0x20 lights the rightmost pixel.                                       |
| Native attributes  | All four values match every native mode table, including blink off-phase behavior.                               |
| ColorAce matrix    | All 16 ordered attribute pairs produce the documented seven-color matrix.                                        |
| Canonical encoding | Each of seven ColorAce inks encodes to the defined even/odd pair.                                                |
| Round trip         | decode(encode(image)) equals the constrained result preview; imported gap bytes survive preserve-mode re-export. |
| Fixture            | magicland.bin file hash and decoded RGBA hash match the values above.                                            |
| Integration        | Worker dispatch, project save/load, profile import/export and UI switching retain mode identity.                 |

# Open decisions and exclusions

- Measured palette: replace or supplement emulator sRGB values when measured XYZ/RGB data for a specific PMD output and monitor becomes available.

- Exact CRT active-area timing: square-pixel logical preview is the baseline; 4:3 stretch remains an optional approximation until timing/geometry is measured.

- PTP/tape export: excluded from version 1.0. Add only after defining the exact PTP block/header and a safe row-wise loader.

- ColorAceEx Mono/Gray: excluded from the initial platform. Its compatibility modes can be added later without changing the shared VRAM codec.

- Consul 2717 384×256 mode and other PMD-compatible computers: separate future modes because their visible width/addressing differs.

# Implementation action plan

1.  Add pmd-85 platform and mode types; freeze the stable IDs in this document.

2.  Implement and test the raw 16 KiB codec before conversion logic.

3.  Add native 6×1 conversion and the PMD 85-3 RGB profile as the first vertical slice.

4.  Add PMD 85-3 PAL, PMD 85-2 TV/CV and PMD 85-2 RGB profiles by reusing the codec with different attribute maps.

5.  Add the ColorAce 6×2 evaluator and verify it with magicland.bin.

6.  Extend worker dispatch, project metadata, UI controls and import/export paths.

7.  Run reference-file, build, type-check, regression and visual preview verification before enabling the platform by default.

# Sources

**\[S1\]** [PMD 85 Infoserver - VideoRAM](https://pmd85.borik.net/wiki/VideoRAM)

**\[S2\]** [PMD 85-3 operating manual download (Tesla / RM-TEAM archive)](https://pmd85.borik.net/?action=download&did=55)

**\[S3\]** [PMD 85 Infoserver - ColorAce](https://pmd85.borik.net/wiki/ColorAce)

**\[S4\]** [ColorAce Screen Editor and implementation](https://pmd85.borik.net/colorace/)

**\[S5\]** [GPMD85Emulator - ScreenPMD85.cpp](https://github.com/mborik/GPMD85Emulator/blob/master/src/ScreenPMD85.cpp)

**\[S6\]** [GPMD85Emulator - Emulator.cpp](https://github.com/mborik/GPMD85Emulator/blob/master/src/Emulator.cpp)

**\[S7\]** [GPMD85Emulator README - raw memory-block loading](https://github.com/mborik/GPMD85Emulator)

**\[S8\]** [ColorAce built-in Magicland Dizzy test vector](https://pmd85.borik.net/colorace/screen.db/magicland.bin)

**\[S9\]** [SinDiKat - PMD85 a farbicky (hardware color notes)](https://sindik.at/?p=889750)

**\[S10\]** [PMD 85 Infoserver - model overview](https://pmd85.borik.net/wiki/PMD_85/en)

*Source review date: 1 August 2026.*
