# Ordered dithering comparison — Bayer 4×4

## Summary

On the supplied project, the ordered coverage-normalized v7 and threshold-identity v1 runs produced the best measured reconstruction score. They are pixel-identical to one another and score 8.19% lower than the other six tested engines. The other six also produced one identical preview on this particular source. This means the comparison distinguishes two output families here, not eight visibly different results.

## Test setup

- Reference: `/Users/jan/Downloads/ChatGPT-Image-Sep-21,-2026,-09-41-31-PM.rccproject`
- Source: 1448×1086 PNG, cropped to the ZX Standard 256×192 output.
- Matrix and dither settings: Bayer 4×4, ordered, 60%.
- Held constant: reference-halo-v1 attribute optimizer, BRIGHT off, all eight base colors enabled, gamma 97, sharpening 72, attribute smoothing 39, halo influence 100 with 1×1 radius, and all crop/framing settings.
- Each run used High conversion quality. Only the dither-engine ID changed.
- The Osg v1 result reproduced the project’s saved quality score exactly (698,207,024), validating the test setup.

## Results

Lower score is better. The score is the project’s squared-sRGB reconstruction metric; it is useful for controlled comparison, but is not a perceptual-quality score.

| Ordered engine | Lifecycle | Score | Difference vs. best | Median time* | Preview group |
|---|---|---:|---:|---:|---|
| Osg attribute-aware v1 | hidden from selection | 698,207,024 | +8.92% | 238 ms | A |
| Osg unrestricted v2 | no lifecycle tag | 698,207,024 | +8.92% | 121 ms | A |
| Local-tone v3 | hidden from selection | 698,207,024 | +8.92% | 121 ms | A |
| Exhaustive palette pairs v4 | hidden from selection | 698,207,024 | +8.92% | 118 ms | A |
| Baseline-additive v5 | no lifecycle tag | 698,207,024 | +8.92% | 118 ms | A |
| Strict-matrix v6 | promoted | 698,207,024 | +8.92% | 119 ms | A |
| Coverage-normalized v7 | experimental | **641,051,712** | **baseline −8.19%** | **88 ms** | B |
| Threshold-identity v1 | experimental | **641,051,712** | **baseline −8.19%** | 204 ms | B |

*Median of five consecutive High-quality conversions on this machine; useful as a rough comparison, not a portable benchmark. “Difference vs. best” is relative to the best score. The table’s +8.92% is the score excess over best, while the 8.19% figure is the reduction from the A-group baseline.

### Preview groups

- Group A: Osg v1, unrestricted v2, local-tone v3, palette-pairs v4, baseline-additive v5, and strict-matrix v6 were byte-identical in their generated preview PNGs for this input.
- Group B: coverage-normalized v7 and threshold-identity v1 were byte-identical to each other, and different from Group A.

## Interpretation

The visible distinction is not among all the named algorithms on this image; it is primarily between the shared local-ordered output (Group A) and the normalized-threshold output (Group B). Group B has the lower pixel-error score, with the two experimental engine IDs yielding the exact same image here. The modest timing difference between those two equivalent outputs suggests their surrounding conversion paths differ in cost even though their final preview does not.

The supplied source is a detailed color image, not a neutral linear-ramp chart. This A/B therefore shows how these engines behave on this project, but does not establish monotonic tone response or prove that Bayer 4×4 handles linear gradients correctly. A separate grayscale ramp with fixed palette endpoints is still needed for that question.

## Scope

Included the standard-ZX ordered engines that can run with the project’s current attribute optimizer and Bayer 4×4 setting. Excluded the mixed-only phase-stable engine, clustered/void matrices that require a different matrix, and pattern/coupled engines whose selection is not controlled by the Bayer matrix.
