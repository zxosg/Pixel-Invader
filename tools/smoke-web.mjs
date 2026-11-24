// Browser smoke test: loads the app, imports an image, converts, exercises menus,
// layouts, preview editors, dialogs and exports; fails on any console error.
// Usage: node tools/smoke-web.mjs [outDir]   (SMOKE_URL=http://host:port to reuse a running server)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(root, "test-results", "smoke"));
mkdirSync(outDir, { recursive: true });

let server = null;
let url = process.env.SMOKE_URL;
if (!url) {
  const port = 5290;
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

try {
  await page.goto(url);
  await page.waitForSelector("text=File");
  await settle(800);
  await shot("00-empty");

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

  const focus = page.locator("select").first();
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
