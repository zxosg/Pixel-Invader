# Feature 006 — ZX Palette Calibration

## Status

Implemented — explicit RGB and computed channel-drive ramp definitions are
persisted in settings, used by ZX conversion and rendering paths, and exposed in
the Palette workspace. Static TypeScript checks pass; automated tests and
browser acceptance remain to be run.

## Summary

Add user-definable ZX Spectrum palette calibration with two complementary
authoring modes:

- Explicit RGB colors edited through color pickers.
- A computed channel-drive ramp with independently adjustable single-,
  double-, and triple-channel levels.

Both modes resolve to the same concrete normal/BRIGHT RGB palette and must be
used consistently by ZX conversion, dithering, previews, decoding, inspection,
and artifact metadata.

The feature is a palette calibration feature, not a complete CRT simulator.
CRT scanlines, phosphor response, blur, color bleed, and display-specific
temporal effects remain a separate future display-preview feature.

## Goals

- Allow users to enter arbitrary RGB values for the eight ZX color codes.
- Allow users to tune a computed palette using single-, double-, and
  triple-channel levels.
- Support independent normal and BRIGHT palettes.
- Support a no-BRIGHT workflow by using identical normal and BRIGHT palettes
  and selecting BRIGHT off.
- Preserve the existing ZX color-code and attribute semantics.
- Make the effective palette affect the actual conversion algorithm, not only
  palette swatches.
- Keep exact previews, decoded imports, and exported metadata consistent with
  the selected calibration.
- Preserve byte-identical output for the current default palette.
- Reuse the existing PMD calibration concepts where the target model is
  applicable.

## Non-goals

- Changing the ZX `.scr` binary format. The file still stores color codes and
  the BRIGHT bit, not arbitrary RGB values.
- Adding more than eight ZX color codes or changing the hardware attribute
  constraints.
- Treating HSV as the physical CRT model. HSV may be used by the color-picker
  UI, but calibration is stored as RGB or explicit computed parameters.
- Implementing scanlines, phosphor simulation, analog blur, color bleed,
  white-balance drift, or temporal CRT display effects.
- Applying a global mutable palette to the conversion core.

## Terminology and color model

The ZX color code keeps its existing bit mapping:

| Code | Name | Active channels |
|---:|---|---|
| 0 | Black | none |
| 1 | Blue | B |
| 2 | Red | R |
| 3 | Magenta | R+B |
| 4 | Green | G |
| 5 | Cyan | G+B |
| 6 | Yellow | R+G |
| 7 | White | R+G+B |

The resolved palette is conceptually:

```ts
interface ZxPalette {
  readonly normal: readonly RgbColor[]; // exactly 8 entries
  readonly bright: readonly RgbColor[]; // exactly 8 entries
}
```

Black is normally `{ r: 0, g: 0, b: 0 }` in both planes. Explicit mode may
still validate and display it as a regular color entry, while computed mode
keeps black fixed at zero.

## Palette authoring modes

### Explicit RGB palette

The user edits each color through an RGB-capable color picker. The editor
shows the semantic ZX color name and code while allowing normal and BRIGHT
values to be edited independently.

The explicit representation is suitable for:

- Measured CRT or emulator colors.
- Hand-tuned palettes.
- Non-symmetric channel behavior.
- White-balance and phosphor-specific approximations.

The stored explicit values are sRGB byte values from 0 through 255, matching
the existing profile palette representation and the current UI color model.

### Computed channel-drive ramp

The computed representation has three independently editable levels for each
palette plane:

```ts
interface ZxChannelDriveRamp {
  readonly singleChannel: number;
  readonly doubleChannel: number;
  readonly tripleChannel: number;
}
```

For a non-black color, the number of active channels selects the level. Each
active channel receives that level and each inactive channel receives zero.
For example:

```text
singleChannel = 128
doubleChannel = 160
tripleChannel = 192
```

resolves to:

```text
blue    = 0,0,128
red     = 128,0,0
green   = 0,128,0
magenta = 160,0,160
cyan    = 0,160,160
yellow  = 160,160,0
white   = 192,192,192
```

The three-level representation is preferred over a hidden start/end formula,
because it lets users deliberately tune the secondary-color level. A helper
preset may still expose a two-endpoint ramp which derives the middle level as
the rounded midpoint.

Each plane has its own ramp. The existing standard palette is representable
as:

```text
normal: single=205, double=205, triple=205
bright: single=255, double=255, triple=255
```

A no-BRIGHT palette can use the same ramp for both planes, for example:

```text
normal: single=128, double=160, triple=192
bright: single=128, double=160, triple=192
```

## BRIGHT behavior

The existing `auto`, `on`, and `off` BRIGHT policies remain legal attribute
selection policies. Calibration does not remove the BRIGHT bit from the file
format.

When normal and BRIGHT RGB entries are identical, the UI should explain that
the two planes are visually collapsed. The user may still leave BRIGHT off to
avoid redundant encoded attributes. When the planes differ, the current BRIGHT
policy controls whether the converter may use the normal plane, bright plane,
or both.

The default calibration must resolve exactly to the current 205/255 palette so
existing output remains unchanged.

## Calibration storage and profile integration

Calibration selection should follow the existing PMD pattern:

- A hardware mode has a base calibration.
- A profile may provide named additional calibrations.
- The selected calibration is identified by a stable ID.
- The application resolves the selected calibration to concrete RGB values
  before conversion.

Existing explicit `screens[].colors[].normal/bright` profile entries remain
valid. Computed calibrations require an additive profile-schema extension, for
example an optional typed generator descriptor alongside the resolved screen
colors. The schema version must be bumped if computed definitions are stored
in imported profile files.

The resolver must always produce concrete values before invoking conversion.
The conversion core must not parse profile JSON or depend on profile IDs.

For user-authored palettes that are not part of an imported profile, the
project settings must retain the calibration definition or a content-addressed
custom calibration record. A calibration ID alone is insufficient if the
referenced profile is no longer available.

## Conversion pipeline requirements

The resolved ZX palette must be threaded explicitly through every path that
currently calls the hard-coded ZX color helper, including:

- Standard ZX attribute optimization.
- Ordered and error-diffusion quantization.
- Mixed two-screen ZX conversion.
- Structured ZX conversion.
- Vertical-spatial ZX conversion.
- Attribute and frame preview rendering.
- Result decoding and flash-preview rendering.
- Palette inspection and result bitmap editing.

The implementation should use an immutable palette value passed through
function parameters. It must not replace the default palette globally, because
workers, tests, previews, and benchmark jobs may overlap.

The public core API should retain a default-palette path for existing callers,
while the web worker sends the resolved palette explicitly, analogous to the
current PMD foreground-palette path.

## UI requirements

The Palette workspace should provide:

- Calibration selector.
- Explicit/computed mode selector where the selected calibration is editable.
- Eight semantic color rows showing code, name, normal swatch, and BRIGHT
  swatch.
- Color-picker editing for explicit values.
- Three numeric or slider controls for single-, double-, and triple-channel
  levels in computed mode.
- A compact resolved-palette preview showing the actual RGB values.
- A clear indication when normal and BRIGHT planes are identical.
- A reset action for the active calibration draft.

The UI may continue to use HSV internally for picker interaction, but saving
must resolve to validated RGB byte values or validated ramp parameters.

All palette swatches used by conversion controls, result previews, inspection,
and bitmap editing must come from the resolved calibration rather than a
separate hard-coded `ZX_BASE_COLORS` display list. Semantic names and codes
remain stable.

## Persistence and artifact metadata

Persist:

- Selected calibration ID.
- Profile identity and content hash when a profile supplies the calibration.
- Custom calibration definition or resolved palette when the calibration is
  user-authored outside a profile.
- Generator/version identifiers for computed calibrations.

Artifact metadata should include the selected ZX calibration and a resolved
palette hash. This makes it clear that an `.scr` file alone does not carry the
RGB interpretation needed for an exact calibrated preview.

Changing the palette must invalidate conversion and preview caches, even when
the encoded palette selections and all other conversion settings are unchanged.

## CRT relationship

Palette calibration approximates the RGB values produced by a display or
emulator. It does not reproduce spatial or temporal display behavior.

A later CRT preview feature may consume the resolved output and apply a
versioned display model containing effects such as phosphor response, scanline
weighting, blur, color bleed, and temporal blending. That display preview must
remain separate from normative `.scr` bytes and from the palette optimizer's
input unless a future calibration explicitly defines a closed-loop display
model.

## Acceptance criteria

- The default ZX calibration produces byte-identical `.scr`, attributes,
  previews, scores, and metadata-compatible results compared with the current
  implementation.
- Explicit RGB changes affect conversion decisions and exact previews.
- Computed single/double/triple ramps resolve deterministically to the expected
  eight normal and eight BRIGHT RGB entries.
- The `128/160/192` example produces the documented blue, secondary, and white
  values.
- Normal and BRIGHT ramps can be identical, supporting a no-BRIGHT workflow.
- BRIGHT `auto`, `on`, and `off` remain valid and deterministic for custom
  palettes.
- Standard, mixed, structured, and vertical-spatial ZX paths all use the same
  resolved palette.
- Imported and decoded results render with the selected calibration.
- Palette edits invalidate stale Draft and High results safely.
- Project save/open preserves custom palette definitions and resolved output.
- Artifact metadata records enough calibration identity to explain the RGB
  preview.
- Malformed colors, ramp values, duplicate IDs, missing entries, and invalid
  calibration references are rejected or safely normalized.
- Existing PMD calibration behavior remains unchanged.

## Deferred follow-up

Add a separate calibrated CRT inspection preview after palette calibration has
stable corpus fixtures. The preview should be versioned independently and must
not silently change conversion output or exported `.scr` bytes.
