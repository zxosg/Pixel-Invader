// Browser smoke test: loads the app, imports an image, converts, exercises menus,
// layouts, preview editors, dialogs and exports; fails on any console error.
// Usage: node tools/smoke-web.mjs [outDir]   (SMOKE_URL=http://host:port to reuse a running server; SMOKE_PORT to pin the dev-server port)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(root, "test-results", "smoke"));
mkdirSync(outDir, { recursive: true });

let server = null;
let url = process.env.SMOKE_URL;
if (!url) {
  // Free port by default so parallel worktrees never reuse each other's dev server; SMOKE_PORT pins one.
  const port = Number(process.env.SMOKE_PORT) || await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, () => { const { port: free } = probe.address(); probe.close(() => resolvePort(free)); });
  });
  server = spawn("pnpm", ["--filter", "@retro-converter/web", "exec", "vite", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
  url = `http://localhost:${port}/`;
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(url)).ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
}

const problems = [];
const report = { exports: {}, steps: [] };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

const shot = async (name) => {
  await page.screenshot({ path: join(outDir, `${name}.png`), animations: "disabled" });
  writeFileSync(join(outDir, `${name}.html`), await page.evaluate(() => document.body.innerHTML));
  report.steps.push(name);
};
const settle = (ms = 400) => page.waitForTimeout(ms);
const expect = (cond, message) => { if (!cond) problems.push(`assert: ${message}`); };
const menu = async (label) => { await page.getByRole("button", { name: label, exact: true }).click(); await settle(250); };
const closeMenu = async (label) => { await page.getByRole("button", { name: label, exact: true }).click(); await settle(150); };

// Contrast audit: axe-core color-contrast (serious/critical) plus a computed-style ratio check that
// also covers text axe skips (e.g. titles over transparent backgrounds). Disabled controls are exempt.
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const auditContrast = async (label) => {
  if (!(await page.evaluate(() => typeof window.axe === "object"))) await page.addScriptTag({ content: axeSource });
  const axeResult = await page.evaluate(() => window.axe.run(document, { runOnly: ["color-contrast"] }));
  for (const v of axeResult.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
    for (const n of v.nodes) problems.push(`contrast (axe, ${label}): ${n.target.join(" ")} ${n.any[0]?.data?.contrastRatio ?? ""}`);
  }
  const low = await page.evaluate(() => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const mix = (top, a, base) => ({ r: top.r * a + base.r * (1 - a), g: top.g * a + base.g * (1 - a), b: top.b * a + base.b * (1 - a) });
    const background = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0) layers.push(c); if (c.a >= 1) break; }
      return layers.reverse().reduce((base, c) => mix(c, c.a, base), { r: 17, g: 21, b: 28 });
    };
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (el.closest("canvas, [disabled], [aria-hidden='true'], .workbench-menu-summary-separator") || el.matches(":disabled")) continue;
      const cs = getComputedStyle(el); const rect = el.getBoundingClientRect();
      if (cs.visibility === "hidden" || cs.display === "none" || rect.width < 2 || rect.height < 2) continue;
      let opacity = 1; for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      const bg = background(el); const fg = parse(cs.color);
      const text = mix(mix(fg, fg.a, bg), opacity, bg);
      const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < 4.5) out.push(`${ratio.toFixed(2)} ${el.tagName.toLowerCase()}.${el.className} "${el.textContent.trim().slice(0, 30)}"`);
    }
    return out;
  });
  for (const entry of low) problems.push(`contrast (computed, ${label}): ${entry}`);
};

try {
  await page.goto(url);
  await page.waitForSelector("text=File");
  await settle(800);
  await shot("00-empty");
  await auditContrast("default layout");
  expect(await page.locator(".settings-sidebar").count() === 1, "guided layout shows the settings sidebar by default");
  await menu("View");
  await page.getByRole("radio", { name: /Pro workspace/ }).click();
  await settle(400);
  await menu("File");
  await auditContrast("File menu open");
  await closeMenu("File");

  // Regression: importing a large image must not freeze the main thread (a heartbeat must keep ticking).
  await page.evaluate(() => {
    window.__heartbeat = { max: 0, last: performance.now() };
    setInterval(() => {
      const now = performance.now();
      window.__heartbeat.max = Math.max(window.__heartbeat.max, now - window.__heartbeat.last);
      window.__heartbeat.last = now;
    }, 50);
  });
  const bigPng = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 4000; canvas.height = 3000;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 4000, 3000);
    gradient.addColorStop(0, "#c33"); gradient.addColorStop(0.5, "#3c3"); gradient.addColorStop(1, "#33c");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 4000, 3000);
    for (let i = 0; i < 400; i += 1) { ctx.fillStyle = `hsl(${i * 7 % 360} 80% 50%)`; ctx.fillRect((i * 97) % 3900, (i * 61) % 2900, 120, 90); }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.setInputFiles("input[type=file] >> nth=0", { name: "large.png", mimeType: "image/png", buffer: Buffer.from(bigPng) });
  await page.waitForSelector("text=Accepted PNG", { timeout: 30000 });
  await settle(2500);
  const stall = await page.evaluate(() => window.__heartbeat.max);
  report.largeImageMaxStallMs = Math.round(stall);
  expect(stall < 3000, `large image import keeps the page responsive (max main-thread stall ${Math.round(stall)}ms)`);

  await page.setInputFiles("input[type=file] >> nth=0", join(root, "test-fixtures", "selfie.png"));
  await page.waitForSelector("text=Accepted PNG", { timeout: 20000 });
  await settle(2500);
  await shot("01-loaded");

  await page.getByRole("button", { name: "Convert High" }).click();
  await page.waitForSelector("text=Completed final", { timeout: 60000 });
  await settle(500);
  const body = await page.locator("body").innerText();
  report.status = body.match(/Completed final[^\n]*/)?.[0];
  expect(/6,912 \/ 6,912 bytes/.test(body), "conversion reports full ZX screen");
  expect((await page.locator("canvas, img").count()) > 0, "preview renders");
  await shot("02-converted");

  // Fit: the shell must not scroll the page, and header + Convert must stay inside the viewport.
  for (const [width, height] of [[1440, 900], [1280, 720], [820, 1180]]) {
    await page.setViewportSize({ width, height });
    await settle(500);
    const fit = await page.evaluate(() => {
      const de = document.documentElement;
      const convert = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Convert High"))?.getBoundingClientRect();
      const header = document.querySelector(".workbench-menubar")?.getBoundingClientRect();
      return { sw: de.scrollWidth, sh: Math.max(de.scrollHeight, document.body.scrollHeight), w: innerWidth, h: innerHeight, convert, header };
    });
    const tag = `${width}x${height}`;
    expect(fit.sw <= fit.w, `no horizontal scroll at ${tag} (scrollWidth ${fit.sw} > ${fit.w})`);
    expect(fit.sh <= fit.h, `no page vertical scroll at ${tag} (scrollHeight ${fit.sh} > ${fit.h})`);
    expect(fit.header && fit.header.top >= 0 && fit.header.bottom <= fit.h, `header visible at ${tag}`);
    expect(fit.convert && fit.convert.top >= 0 && fit.convert.bottom <= fit.h && fit.convert.right <= fit.w, `Convert button visible at ${tag}`);
    await shot(`02-fit-${tag}`);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await settle(400);

  for (const label of ["File", "Convert", "View", "Window", "Tools"]) {
    await menu(label);
    const items = await page.locator("[data-workbench-menu] button").count();
    expect(items > 0, `${label} menu has items`);
    if (label === "File") await shot("03-file-menu");
    await closeMenu(label);
  }

  for (const [label, file] of [["PNG Preview", "png"], ["Hardware Binary", "bin"], ["Metadata JSON", "meta"], ["Inspection JSON", "insp"]]) {
    await menu("File");
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
    await page.locator("[data-workbench-menu] button", { hasText: label }).first().click();
    try {
      const download = await downloadPromise;
      const path = await download.path();
      const bytes = readFileSync(path);
      report.exports[file] = { name: download.suggestedFilename(), size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex").slice(0, 16) };
    } catch (error) {
      problems.push(`export ${label}: ${error.message}`);
    }
    await settle(200);
  }

  for (const layout of ["Palette tuning", "Dithering review", "Editor", "Pixel inspection", "Conversion"]) {
    await menu("View");
    await page.locator("[data-workbench-menu] button", { hasText: layout }).first().click();
    await settle(900);
    await shot(`04-layout-${layout.toLowerCase().replace(/\s+/g, "-")}`);
  }

  const contentSelect = (slot) => page.locator("select", { hasText: "Bitmap editor" }).nth(slot);
  expect((await page.locator("select", { hasText: "Bitmap editor" }).count()) >= 2, "source/result preview selectors found");
  for (const slot of [0, 1]) {
    const side = slot === 0 ? "source" : "result";
    const opts = await contentSelect(slot).evaluate((s) => [...s.options].map((o) => o.text));
    for (const option of opts) {
      await contentSelect(slot).selectOption({ label: option });
      await settle(900);
      await shot(`05-${side}-${option.toLowerCase().replace(/[^a-z]+/g, "-")}`);
    }
    await contentSelect(slot).selectOption({ label: slot === 0 ? "Source image" : "Result image" });
    await settle(300);
  }

  const focus = page.locator("select[aria-label=\"Configuration focus\"]");
  for (const option of await focus.evaluate((s) => [...s.options].map((o) => o.text))) {
    await focus.selectOption({ label: option });
    await settle(500);
  }
  await focus.selectOption({ label: "All controls" });

  for (const section of ["Tools", "Geometry", "Image adjustments", "ZX palette and attributes", "Dithering"]) {
    const toggle = page.locator("button:not(.workbench-menu-trigger)", { hasText: new RegExp(`^\\s*▸?\\s*${section}`) }).first();
    if (await toggle.count()) { await toggle.click(); await settle(300); }
  }
  await shot("06-sections-open");

  await menu("View");
  await page.getByRole("radio", { name: /Guided layout/ }).click();
  await settle(1200);
  await shot("06b-guided-loaded");
  await auditContrast("guided layout, advanced tier");
  expect(await page.locator("#sidebar-gamma").count() === 1, "advanced tier shows gamma");
  await page.getByRole("radio", { name: "Basic", exact: true }).click();
  await settle(300);
  expect(await page.locator("#sidebar-gamma").count() === 0, "basic tier hides gamma");
  await page.locator("#sidebar-brightness").fill("20");
  await settle(300);
  await page.getByRole("radio", { name: "Expert", exact: true }).click();
  await settle(300);
  expect(await page.locator("footer.status-bar").count() === 1, "status bar is shown");
  await page.setViewportSize({ width: 820, height: 1180 });
  await settle(500);
      for (const tab of ["Source", "Result", "Settings"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await settle(400);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
        expect(sw, `no horizontal scroll on ${tab} tab at 820`);
        await shot(`02-tablet-${tab.toLowerCase()}`);
        await auditContrast(`tablet ${tab} tab`);
      }
      expect(await page.locator(".settings-sidebar").isVisible(), "settings tab shows sidebar at 820");
      await page.getByRole("tab", { name: "Compare", exact: true }).click();
      await settle(300);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await settle(400);
  {
    const target = page.getByLabel("Target profile");
    const labels = await target.locator("option").allTextContents();
    const pick = (re) => labels.find((l) => re.test(l));
    const cycle = [pick(/Sinclair QL/i), pick(/PMD ?85/i), pick(/ZX Spectrum 48K standard/i)].filter(Boolean);
    expect(cycle.length === 3, `profile cycle options found (${cycle.join(" | ")})`);
    for (const label of cycle) {
      await target.selectOption({ label });
      await settle(1200);
      await page.locator("button.workflow-convert").click().catch(() => {});
      await settle(2500);
      const failed = await page.locator("footer.status-bar-error, [role=alert]").allTextContents();
      expect(failed.length === 0, `no error after switching to ${label}: ${failed.join(" / ")}`);
    }
    await shot("06g-profile-cycle");
  }
  await shot("06c-guided-expert");
  await auditContrast("guided layout, expert tier");
  for (const [name, shotName] of [["Swipe", "06d-compare-swipe"], ["Result only", "06e-compare-result-only"], ["Difference", "06f-compare-difference"]]) {
    await page.getByRole("radio", { name, exact: true }).first().click();
    await settle(400);
    expect(await page.locator(`.comparison[data-compare-mode]`).count() === 1, `compare mode ${name} applies`);
    await shot(shotName);
    if (name === "Swipe") { expect(await page.getByRole("slider", { name: "Swipe divider" }).count() === 1, "swipe divider handle present"); }
    await auditContrast(`compare ${name}`);
  }
  await page.getByRole("radio", { name: "Side by side", exact: true }).click();
  await settle(300);
  await page.getByRole("radio", { name: "Advanced", exact: true }).click();
  await menu("Tools");
  await page.locator("[data-workbench-menu] button", { hasText: "Palette editor" }).click();
  await settle(700);
  await shot("07-palette-editor");
  await page.keyboard.press("Escape");
  await settle(300);
  await menu("Tools");
  await page.locator("[data-workbench-menu] button", { hasText: "Application Settings" }).click();
  await settle(700);
  await shot("08-app-settings");
  await page.keyboard.press("Escape");
  await settle(300);
} catch (error) {
  problems.push(`exception: ${error.message}`);
  await shot("zz-failure").catch(() => {});
}

report.problems = problems;
writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
server?.kill();
if (problems.length) {
  console.error(`smoke FAILED:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`smoke OK (${report.steps.length} screenshots in ${outDir})`);
