# Ordered mode and pattern sweep — ZX grayscale test image

## Result at a glance

I ran **62 combinations across all 13 ordered engines compatible with the project’s ZX Standard mode and reference-halo-v1 optimizer**. They produced 25 distinct previews. The lowest squared-RGB error came from **coverage-normalized v7 with Bayer 4×4**; threshold-identity v1 produced the exact same preview. However, the difference between Bayer 4×4 and 8×8 within that family is tiny, while Osg attribute-aware v1 with Bayer 2×2 was the strongest result among the other matrix engines.

This is a useful comparison of this test card, not a general perceptual ranking. The metric rewards per-pixel RGB agreement and does not judge whether a texture looks pleasing or whether a ramp is perceptually smooth.

## Test conditions

- Input: `/Users/jan/Pictures/3_zx/download.png`, 256×192. Its file hash matches the source embedded in `/Users/jan/Downloads/download (3).rccproject`.
- Output: ZX Spectrum Standard, 256×192, High quality.
- Held constant from that project: reference-halo-v1 optimizer; ordered dithering at 50%; attribute height 8; all eight base colors; BRIGHT auto; gamma 100; attribute smoothing 100; halo influence 100 with horizontal radius 2 and vertical radius 0; fill framing and bilinear resampling.
- Varied: each engine’s supported built-in matrix selections; artistic preference selections where that control is exposed.
- Score: `squared-srgb-cell-cost-v1`; lower is better. Only scores within this same ZX conversion path are compared.

## Matrix-driven results

Scores are shown in thousands separators. `—` means the engine does not offer that built-in matrix in this mode.

| Engine / engine group | Checkerboard 2×1 | Bayer 2×2 | Bayer 4×4 | Bayer 8×8 | Clustered dot 4×4 | Clustered dot 8×8 | Void-cluster 8×8 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Osg attribute-aware v1 | 688,733,160 | **678,310,140** | 686,298,990 | 688,284,825 | — | — | — |
| Osg unrestricted v2; local-tone v3; palette-pairs v4; baseline-additive v5; strict-matrix v6 | 691,495,740 | 726,058,740 | 747,859,260 | 746,100,360 | — | — | — |
| Coverage-normalized v7 | 800,013,720 | 660,930,240 | **655,921,680** | 656,325,120 | — | — | — |
| Threshold-identity v1 | 800,013,720 | 660,930,240 | **655,921,680** | 656,325,120 | 669,158,940 | 839,690,445 | 658,953,015 |
| Clustered-dot ordered v1 | — | — | — | — | 803,760,300 | 1,087,997,925 | — |
| Void-and-cluster threshold v1 | — | — | — | — | — | — | 746,254,110 |

The five-engine Osg/local-tone/palette-pairs/additive/strict group produced identical pixels for each of its four matrices on this input. The coverage-normalized and threshold-identity engines likewise matched pixel-for-pixel on the four shared Bayer/checker matrices.

## Artistic ordered results

The artistic preference choices were `auto`, `checkerboard`, `horizontal`, and `vertical`.

| Engine | Auto | Checkerboard | Horizontal | Vertical | Best on this image |
|---|---:|---:|---:|---:|---|
| Artistic ordered hybrid v1 (Bayer 4×4 held fixed) | 738,669,161 | 737,520,033 | 741,995,081 | **736,721,917** | Vertical |
| Artistic ordered tone-safe v2 (Bayer 4×4 held fixed) | 1,223,003,340 | 1,223,003,340 | 1,223,003,340 | 1,225,359,866 | Auto / checkerboard / horizontal tie |
| Artistic chessboard smooth v1 | 754,133,182 | 754,133,182 | 754,133,182 | 754,133,182 | All tie |

For artistic chessboard smooth v1, all 16 combinations of four exposed matrix choices and four artistic preferences generated the **same preview**. On this test and current code path, neither control changed the output. Tone-safe v2 produced two distinct previews: auto/checkerboard/horizontal matched, while vertical differed slightly.

## Visual and numeric takeaways

1. **Best measured result:** coverage-normalized v7 + Bayer 4×4 (655,921,680). It is about 12.3% lower than strict-matrix v6 + Bayer 4×4 (747,859,260). Threshold-identity v1 is pixel-identical at the same matrix.
2. **Bayer 8×8 is effectively tied with 4×4 in the best-scoring family:** 656,325,120, only about 0.06% higher. The choice between those two should be made by texture preference, not this score.
3. **Best non-normalized matrix result:** Osg attribute-aware v1 + Bayer 2×2 (678,310,140). It beats the Osg/local-tone/palette-pairs/additive/strict group at each shared matrix in this test.
4. **Clustered-dot v1 is a poor fit for this card:** its 8×8 result scores substantially worse than its 4×4 version and worse than the threshold-identity engine using the same clustered matrices.
5. **The pattern control issue is concrete:** artistic chessboard smooth v1 exposes matrix and motif choices that did not affect any of the 16 outputs tested. This may be intentional because the engine fixes its carrier, but the controls are misleading for this engine/input.
6. Matrix choice matters: within the local engine group, Bayer 2×2 scores best; within normalized/threshold engines, Bayer 4×4 narrowly leads Bayer 8×8. There is no single matrix winner across algorithms.

## Preview gallery

The generated previews are 256×192 and retained under `/private/tmp/osgconvert-ordered-pattern-sweep/`; [results.json](/private/tmp/osgconvert-ordered-pattern-sweep/results.json) contains every tested engine, pattern, score, preview hash, and timing. A few representative outputs:

- Best metric: [coverage-normalized v7, Bayer 4×4](/private/tmp/osgconvert-ordered-pattern-sweep/ordered-coverage-normalized-v7__bayer-4x4.png)
- Strict-matrix baseline: [strict-matrix v6, Bayer 4×4](/private/tmp/osgconvert-ordered-pattern-sweep/ordered-strict-matrix-v6__bayer-4x4.png)
- Best Osg/local result: [Osg attribute-aware v1, Bayer 2×2](/private/tmp/osgconvert-ordered-pattern-sweep/ordered-osg-v1__bayer-2x2.png)
- Clustered-dot 4×4: [clustered-dot ordered v1](/private/tmp/osgconvert-ordered-pattern-sweep/ordered-clustered-dot-v1__clustered-dot-4x4.png)
- Clustered-dot 8×8: [clustered-dot ordered v1](/private/tmp/osgconvert-ordered-pattern-sweep/ordered-clustered-dot-v1__clustered-dot-8x8.png)
- Artistic hybrid vertical: [artistic ordered hybrid v1](/private/tmp/osgconvert-ordered-pattern-sweep/artistic-ordered-hybrid-v1__bayer-4x4__vertical.png)

## Scope limits

The sweep included every ordered engine available with the project’s current optimizer. Mixed-only v8, structured cell-pattern engines, and legal-mask DBS were not included because they require a different target or a coupled optimizer; comparing them would also change the optimizer rather than only the ordered engine/pattern. Custom user matrices were not present in the project and were not tested.
