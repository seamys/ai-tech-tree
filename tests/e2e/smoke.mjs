// End-to-end smoke test: serves dist/ and drives the real app in Chromium.
//
//   npm run build && npm run test:e2e
//
// Set CHROME_PATH to use an installed Chrome instead of Playwright's bundled browser
// (`npx playwright install chromium`). Exits non-zero on the first failed check.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const ROOT = join(import.meta.dirname, "../../dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  try {
    const file = join(ROOT, path.endsWith("/") ? path + "index.html" : path);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;

let failures = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// Visible node labels: count, rendered heights and pairwise overlaps.
const LABELS = () => {
  const k = 1 / parseFloat(getComputedStyle(document.querySelector("svg")).getPropertyValue("--s"));
  const rects = [...document.querySelectorAll("g.node")].filter((g) => g.style.display !== "none")
    .map((g) => g.querySelector("text")).filter((t) => getComputedStyle(t).display !== "none")
    .map((t) => t.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight);
  let overlaps = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 3 && a.bottom > b.top + 3) overlaps++;
  }
  return { k, count: rects.length, overlaps, heights: [...new Set(rects.map((r) => Math.round(r.height)))] };
};

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
};
const open = async (query, viewport = { width: 1440, height: 900 }, extra = {}) => {
  const ctx = await browser.newContext({ viewport, ...extra });
  const page = await ctx.newPage();
  watch(page);
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(BASE + query);
  await page.waitForSelector("g.node", { state: "attached" }); // the first node in DOM order may be culled
  await page.waitForTimeout(500);
  return { page, requests };
};

try {
  // 1. First visit shows the lens picker; choosing a lens dims the rest and updates the URL.
  {
    const { page } = await open("?theme=observatory#zh");
    check(await page.locator(".lenspicker").count() === 1, "first visit opens the lens picker");
    await page.click(".lens >> nth=1");
    await page.click(".lenspicker .btn.primary");
    await page.waitForTimeout(500);
    check(page.url().includes("focus=frontier-llm"), "lens is mirrored to the URL", page.url());
    check(await page.locator("g.node.unfocus").count() > 0, "out-of-focus nodes are dimmed");
    await page.reload(); await page.waitForSelector("g.node", { state: "attached" }); // the first node in DOM order may be culled
    check(await page.locator(".lenspicker").count() === 0, "focus is remembered after reload");
  }

  // 2. Hide mode compacts the tree; a shared link applies without the picker.
  {
    const { page } = await open("?focus=energy&fmode=hide#en");
    const n = await page.locator("g.node").count();
    check(await page.locator(".lenspicker").count() === 0 && n > 0 && n < 40, "shared hide link compacts the tree", `${n} nodes`);
    await page.fill(".search", "Transformer"); await page.press(".search", "Enter"); await page.waitForTimeout(800);
    check(await page.locator("g.node.sel").count() === 1, "selecting an out-of-focus node still shows it");
  }

  // 3. Labels keep one on-screen size at every zoom and never overlap.
  {
    const { page } = await open("?theme=observatory&focus=#en");
    await page.mouse.move(800, 450);
    await page.keyboard.down("Control");
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(80); }
    const seen = [];
    for (const target of [0, 0.7, 1.3, 2]) {
      while ((await page.evaluate(LABELS)).k < target) { await page.mouse.wheel(0, -25); await page.waitForTimeout(90); }
      await page.waitForTimeout(400);
      seen.push(await page.evaluate(LABELS));
    }
    await page.keyboard.up("Control");
    const heights = new Set(seen.flatMap((s) => s.heights));
    check(Math.max(...heights) - Math.min(...heights) <= 2, "label size is constant while zooming", `heights ${[...heights]}`);
    check(seen.every((s) => s.overlaps === 0), "no visible labels overlap", seen.map((s) => `k=${s.k.toFixed(2)}:${s.count}`).join(" "));
  }

  // 4. The globe loads lazily and settles (no animation frames while idle).
  {
    const { page, requests } = await open("?theme=observatory&focus=#zh");
    check(!requests.some((u) => /Globe|land-110m/.test(u)), "globe chunk is not loaded up front");
    await page.fill(".search", "DeepSeek-V3"); await page.press(".search", "Enter"); await page.waitForTimeout(3800);
    check(requests.some((u) => /land-110m/.test(u)), "globe map data loads when a panel opens");
    // Selecting a node flies the camera so the node, its parents and its children are on screen,
    // clear of the header and the detail panel. Relatives in another zone (here the H800 chip
    // under DeepSeek-V3) may be too far apart to fit without dropping a level of detail, so the
    // check covers the selected node's own zone.
    const data = JSON.parse(await readFile(join(ROOT, "data/nodes.json"), "utf8"));
    const tax = JSON.parse(await readFile(join(ROOT, "data/taxonomy.json"), "utf8"));
    const zoneOf = (n) => { const b = tax.branches.find((x) => x.id === n.branch); return tax.layers.find((l) => l.id === b.layer).zone; };
    const sel = data.find((n) => n.id === "dsv3");
    const related = [sel, ...data.filter((n) => sel.parents.includes(n.id) || n.parents.includes(sel.id))]
      .filter((n) => zoneOf(n) === zoneOf(sel)).map((n) => n.id);
    const boxes = await page.evaluate((ids) => ids.map((id) => {
      const g = document.querySelector(`g.node[data-id="${id}"] .shape`);
      const r = g?.getBoundingClientRect();
      return r && r.width ? { id, x: r.x + r.width / 2, y: r.y + r.height / 2 } : { id, missing: true };
    }), related);
    const panelLeft = await page.evaluate(() => document.querySelector(".panel").getBoundingClientRect().left);
    const off = boxes.filter((b) => b.missing || b.x < 40 || b.x > panelLeft || b.y < 140 || b.y > 900);
    check(off.length === 0, "selected node, parents and children are on screen", `${related.length - off.length}/${related.length}${off.length ? " off: " + JSON.stringify(off) : ""}`);
    const caption = await page.innerText(".globebox figcaption");
    check(caption.includes("杭州"), "globe caption names the place", caption);
    const frames = await page.evaluate(() => new Promise((res) => {
      let c = 0; const o = requestAnimationFrame;
      window.requestAnimationFrame = (f) => { c++; return o(f); };
      setTimeout(() => { window.requestAnimationFrame = o; res(c); }, 1000);
    }));
    check(frames === 0, "no animation frames while idle", `${frames} in 1s`);
  }

  // 5. Phone header fits; the focus popover opens.
  {
    const { page } = await open("?theme=observatory&focus=creative#zh", { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const review = await page.locator(".btn.warn").boundingBox();
    check(review && review.x + review.width <= 390, "phone header fits the screen");
    await page.tap(".focusbtn"); await page.waitForTimeout(300);
    check(await page.locator(".focusmenu").isVisible(), "focus menu opens on phone");
  }

  check(errors.length === 0, "no console errors", errors.join(" | "));
} finally {
  await browser.close();
  server.close();
}
process.exit(failures ? 1 : 0);
