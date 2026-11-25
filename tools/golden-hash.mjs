#!/usr/bin/env node
// Golden-output harness: hashes every artifact/preview buffer for a matrix of
// engines x modes x settings x images so optimizations can be proven
// byte-identical.  Run `pnpm -r build` first (it imports dist/).
//
//   node tools/golden-hash.mjs --out=golden.json [--workers=8] [--only=substr] [--quick]
//   node tools/golden-hash.mjs --check=golden.json [--workers=8]
//   node tools/golden-hash.mjs --timings --only=substr     (serial, prints ms per case)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const core = await import(new URL("packages/conversion-core/dist/index.js", root));
const codecs = await import(new URL("packages/image-codecs/dist/index.js", root));
const charset = await import(new URL("packages/zx-charset/dist/index.js", root));
const spectrum = await import(new URL("packages/zx-spectrum/dist/index.js", root));
const { DEFAULT_CONVERSION_SETTINGS: DEFAULTS, ATTRIBUTE_OPTIMIZERS, DITHER_ENGINES } = core;

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const quick = args.includes("--quick");
const tier = arg("tier") ?? "fast"; // fast | slow | all

const PMD_PALETTES = {
  "pmd85-2-tv": [[255, 255, 255], [191, 191, 191]],
  "pmd85-2-rgb": [[80, 255, 80], [255, 255, 80], [80, 255, 255], [255, 255, 255]],
  "pmd85-3-tv": [[255, 255, 255], [184, 184, 184], [119, 119, 119], [68, 68, 68]],
  "pmd85-3-pal": [[255, 255, 255], [80, 255, 80], [255, 80, 80], [160, 0, 0]],
  "pmd85-3-rgb": [[80, 255, 80], [255, 80, 80], [80, 80, 255], [255, 80, 255]],
};
const toRgb = (list) => list.map(([r, g, b]) => ({ r, g, b }));

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24;
}
function synthetic(kind, w, h) {
  const rgba = new Uint8Array(w * h * 4);
  const rnd = lcg(12345);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      let r; let g; let b;
      if (kind === "rgb-gradient") { r = x * 255 / (w - 1); g = y * 255 / (h - 1); b = (x + y) * 255 / (w + h - 2); }
      else if (kind === "noise") { r = rnd(); g = rnd(); b = rnd(); }
      else { const c = ((x >> 3) + (y >> 3)) & 1; const v = c ? 230 : 40; r = v; g = x < w / 2 ? v : 255 - v; b = y < h / 2 ? 90 : v; }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
    }
  }
  return { w, h, rgba };
}
const selfie = codecs.decodeImage(new Uint8Array(readFileSync(new URL("test-fixtures/selfie.png", root))));
const IMAGES = {
  selfie: { w: selfie.width, h: selfie.height, rgba: selfie.rgba },
  gradient: synthetic("rgb-gradient", 256, 192),
  noise: synthetic("noise", 128, 96),
  edges: synthetic("edges", 256, 192),
};

const zxPaletteSelection = [{ screenIndex: 0, enabledColorIds: DEFAULTS.paletteSelections[0].enabledColorIds, brightMode: "auto" }];

function baseSettings(platformId, modeId, optimizer, engine) {
  const method = DITHER_ENGINES.find((e) => e.id === engine).method;
  const s = {
    ...DEFAULTS, platformId, modeId, attributeOptimizerId: optimizer, ditherEngineId: engine,
    dithering: method, ditheringAmount: method === "none" ? 0 : 70,
    framing: "fill", resampling: "bilinear", background: { r: 0, g: 0, b: 0 },
    errorDiffusionLineSuppression: 50,
  };
  const withSpatial = (r) => modeId.includes("vertical-spatial")
    ? { ...r, verticalSpatialMix: { schemaVersion: 1, calibrationId: "srgb-ideal-v1", algorithmId: !optimizer.includes("detail") ? "vertical-spatial-uniform-v1" : platformId === "pmd-85" ? "vertical-spatial-pmd-detail-v2" : "vertical-spatial-detail-v1" } }
    : r;
  if (platformId === "zx-spectrum") {
    const count = core.outputScreenCount?.(modeId) ?? (modeId === "zx48-mixed-256x192" ? 2 : 1);
    return withSpatial({
      ...s, zxMixedAttributesOnly: modeId === "zx48-mixed-256x192",
      paletteSelections: Array.from({ length: count }, (_, screenIndex) => ({ ...zxPaletteSelection[0], screenIndex })),
    });
  }
  if (platformId === "pmd-85") {
    const hw = modeId.replace("-vertical-spatial", "");
    const n = PMD_PALETTES[hw].length;
    return withSpatial({
      ...s, paletteSelections: [{ screenIndex: 0, enabledColorIds: Array.from({ length: n }, (_, i) => i) }],
      pmd85: { mode: hw, paletteCalibrationId: "emulator-soft", gapPolicy: "zero" },
    });
  }
  const mixed = modeId === "mode8-mode4-mixed-512x256";
  const n = modeId.startsWith("mode8") ? 8 : 4;
  const screens = modeId.includes("plain") || modeId.includes("vertical-spatial") ? 1 : 2;
  return withSpatial({
    ...s,
    paletteSelections: mixed
      ? [{ screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] }, { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] }]
      : Array.from({ length: screens }, (_, screenIndex) => ({ screenIndex, enabledColorIds: Array.from({ length: n }, (_, i) => i) })),
  });
}

const TIMING_KEYS = new Set(["runtimeMs"]);
function hashValue(value) {
  const h = createHash("sha256");
  const walk = (v) => {
    if (v === null || v === undefined) { h.update(`n${v}`); return; }
    if (ArrayBuffer.isView(v)) { h.update(`B${v.constructor.name}${v.length}:`); h.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); return; }
    if (Array.isArray(v)) { h.update(`A${v.length}[`); v.forEach(walk); h.update("]"); return; }
    if (v instanceof Set || v instanceof Map) { h.update("S"); walk([...v]); return; }
    if (typeof v === "object") {
      h.update("{");
      for (const k of Object.keys(v).sort()) { if (TIMING_KEYS.has(k)) continue; h.update(k + "="); walk(v[k]); }
      h.update("}"); return;
    }
    h.update(`${typeof v}${Object.is(v, -0) ? "-0" : String(v)};`);
  };
  walk(value);
  return h.digest("hex").slice(0, 16);
}

function* cases() {
  let counter = 0;
  const modesFor = (platformId) => ({
    "zx-spectrum": ["zx48-standard-256x192", "zx48-mixed-256x192", "zx48-vertical-spatial-256x192"],
    "sinclair-ql": ["mode8-256x256", "mode4-512x256", "mode8-mode4-mixed-512x256", "mode8-plain-256x256", "mode4-plain-512x256", "mode8-vertical-spatial-256x256", "mode4-vertical-spatial-512x256"],
    "pmd-85": ["pmd85-2-tv", "pmd85-2-rgb", "pmd85-3-tv", "pmd85-3-pal", "pmd85-3-rgb", "pmd85-2-rgb-vertical-spatial", "pmd85-3-rgb-vertical-spatial", "pmd85-3-pal-vertical-spatial"],
  })[platformId];
  const variants = [
    ["base", "selfie", {}],
    ["grad", "gradient", { ditheringAmount: 35 }],
    ["noise-h2", "noise", { attributeHeight: 2, orderedMatrix: "bayer-8x8", errorDiffusionRandomization: 25 }],
    ["edges-adj", "edges", { attributeHeight: 4, brightness: 10, contrast: 15, saturation: 20, attributeHaloVertical: 1, ditheringAmount: 100 }],
  ];
  for (const platformId of ["zx-spectrum", "sinclair-ql", "pmd-85"]) {
    for (const modeId of modesFor(platformId)) {
      const optimizers = platformId === "sinclair-ql" ? [DEFAULTS.attributeOptimizerId] : ATTRIBUTE_OPTIMIZERS.filter((o) => o.platforms.includes(platformId)).map((o) => o.id);
      for (const optimizer of optimizers) {
        for (const engine of DITHER_ENGINES.filter((e) => e.platforms.includes(platformId)).map((e) => e.id)) {
          try { core.assertCompatibleEngines(platformId, optimizer, engine, modeId); } catch { continue; }
          if (platformId === "pmd-85" && modeId.includes("vertical-spatial") !== optimizer.includes("vertical-spatial")) continue;
          const heavy = /shared-bitmap-v[234]|shared-bitmap-v2|gigaattr/.test(optimizer);
          // Heavy shared-bitmap searches take minutes per conversion: slow tier, one engine, base variant only.
          if (heavy && engine !== "ordered-osg-v1") continue;
          if (tier === "fast" && heavy) continue;
          if (tier === "slow" && !heavy) continue;
          counter += 1;
          for (const [variant, image, over] of quick || heavy ? variants.slice(0, 1) : variants) {
            // Extra variants on every third valid combination keep the matrix tractable.
            if (variant !== "base" && counter % 3 !== 0) continue;
            yield { id: `${platformId}|${modeId}|${optimizer}|${engine}|${variant}`, platformId, modeId, optimizer, engine, image, over };
          }
        }
      }
    }
  }
  if (!quick && tier !== "slow") {
    for (const image of ["selfie", "gradient"]) {
      for (const mode of ["standard", "mixed"]) {
        // zx-charset runs on the SCR produced by a ZX conversion
        yield { id: `charset|${mode}|${image}`, charset: true, mode, image };
      }
    }
  }
}

function run(c) {
  const img = IMAGES[c.image];
  if (c.charset) {
    const modeId = c.mode === "mixed" ? "zx48-mixed-256x192" : "zx48-standard-256x192";
    const s = { ...baseSettings("zx-spectrum", modeId, c.mode === "mixed" ? "zx-mixed-joint-cell-v1" : "zx-adaptive-v1", "ordered-osg-v1") };
    const conv = core.convertToZx(img.rgba, img.w, img.h, s);
    const scr = conv.screen ? spectrum.serializeScr(conv.screen) : conv.frames[0].encoded;
    const out = [];
    for (const [source, strategy, metric] of [["derived", "best-coverage", "hybrid"], ["derived", "best-coverage", "hamming"]]) {
      out.push(charset.convertScrToCharset(scr, {
        source, characterBudget: 96, encoding: "compact", allowTransforms: true, allowPolarity: true,
        derivedStrategy: strategy, distanceMetric: metric, visualWeighting: metric === "hybrid", swapRefinementPasses: 2,
      }));
    }
    return out;
  }
  const s = { ...baseSettings(c.platformId, c.modeId, c.optimizer, c.engine), ...c.over };
  if (c.over.ditheringAmount !== undefined && s.dithering !== "none") s.ditheringAmount = c.over.ditheringAmount;
  s.structured = { ...s.structured, ditherAmountPermille: s.ditheringAmount * 10 };
  if (c.platformId === "zx-spectrum") return core.convertToZx(img.rgba, img.w, img.h, s);
  if (c.platformId === "sinclair-ql") return core.convertToQl(img.rgba, img.w, img.h, s);
  return core.convertToPmd85(img.rgba, img.w, img.h, s, toRgb(PMD_PALETTES[s.pmd85.mode]));
}

function exec(c) {
  const t = performance.now();
  let hash;
  try { hash = hashValue(run(c)); } catch (e) { hash = "ERR:" + hashValue(String(e?.message ?? e)); if (process.env.GOLDEN_DEBUG) console.error(c.id, "::", String(e?.message ?? e).slice(0, 140)); }
  return { hash, ms: performance.now() - t };
}

if (!isMainThread) {
  const results = {};
  for (const c of workerData.cases) results[c.id] = exec(c);
  parentPort.postMessage(results);
} else {
  const only = arg("only");
  const all = [...cases()].filter((c) => only === undefined || c.id.includes(only));
  if (args.includes("--list")) { console.log(all.map((c) => c.id).join("\n")); process.exit(0); }
  if (args.includes("--timings")) {
    for (const c of all) { const r = exec(c); console.log(`${r.ms.toFixed(0).padStart(7)}ms ${r.hash} ${c.id}`); }
    process.exit(0);
  }
  const workers = Number(arg("workers") ?? Math.max(1, availableParallelism() - 1));
  const shards = Array.from({ length: workers }, () => []);
  all.forEach((c, i) => shards[i % workers].push(c));
  const parts = await Promise.all(shards.map((cs) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { cases: cs }, argv: process.argv.slice(2) });
    w.once("message", resolve); w.once("error", reject);
  })));
  const results = Object.assign({}, ...parts);
  const hashes = Object.fromEntries(Object.entries(results).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, v.hash]));
  const checkFile = arg("check");
  if (checkFile !== undefined) {
    const golden = JSON.parse(readFileSync(checkFile, "utf8"));
    const bad = Object.keys(golden).filter((k) => hashes[k] !== golden[k] && (only === undefined || k.includes(only)));
    console.log(`${Object.keys(hashes).length} cases, ${bad.length} mismatches`);
    for (const k of bad.slice(0, 20)) console.log("MISMATCH", k);
    process.exit(bad.length === 0 ? 0 : 1);
  }
  const out = arg("out");
  if (out !== undefined) {
    writeFileSync(out, JSON.stringify(hashes, null, 1));
    writeFileSync(out.replace(/\.json$/, ".timings.json"), JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Math.round(v.ms)])), null, 1));
  }
  console.log(`${Object.keys(hashes).length} cases hashed, ${Object.values(hashes).filter((h) => h.startsWith("ERR:")).length} deterministic errors`);
}
