# ZX baseline — Agony 18

Status: visually approved baseline, 2026-07-26.

## Evidence

- Project: `agony-18.rccproject`
- Project artifact SHA-256:
  `4746b0ac8906bbb57db1755eb0c62d97ee1bcc494cbb8b4e4a2df01cde22f4d5`
- Source SHA-256:
  `0f6ca1ab0eacf0ae9315791468ce85dc8af4ea540330d2cce637d80add15ef0b`
- Benchmark table: 187 engine combinations
- Benchmark artifact SHA-256:
  `16cdc13c70feac9df87815c5ddbc15bb3587cfc720b9ef91ca5536ca5d694239`
- Target: ZX Spectrum 48K, 256×192, 8×8 attributes
- Resampling: Bilinear
- Approved attribute optimizer: `zx-guide-reference-halo-v2`
- Halo influence: 137%
- Horizontal/vertical halo: 2/0 pixels
- Approved Ordered engine: `ordered-strict-matrix-v6`
- Approved Error-diffusion engine: `error-diffusion-decorrelated-v3`
- Calibration amount used by the supplied benchmark: 38%

The source-specific project also used brightness +13, saturation +100,
gamma 84%, sharpening 100%, and BRIGHT On. These values describe that image
and are deliberately not global baseline defaults.

## Interpretation

The benchmark's common squared-RGB score remains a diagnostic rather than the
sole quality decision. No dithering ranked first numerically, while visual
review selected Decorrelated error diffusion v3 as the preferred diffusion
baseline and Ordered strict-matrix v6 as the preferred Ordered baseline.
With the approved Halo v2 optimizer, 4×4 strict Ordered appeared at rank 138
(RGB error 700,013,904), and Decorrelated error diffusion v3 appeared at rank
174 (RGB error 718,951,224). Their lower numerical rank is retained as evidence
that squared RGB error does not capture perceived texture quality.

The selected production baseline therefore freezes the engine family and halo
calibration while keeping neutral image adjustments, BRIGHT Auto, and the full
ZX base palette. Historical and Experimental engines remain available for
reproduction and comparison.
