#!/usr/bin/env node
// Production build (default) or dev server (--serve) using esbuild.
//
//   dist/index.html            HTML shell with hashed asset URLs and a data version stamp
//   dist/assets/main-[hash].*  bundled, minified JS and CSS (+ source maps)
//   dist/data/*.json           content, copied as-is and fetched at runtime
//   dist/badges/*.json         shields.io endpoint badges (node count, last update)
//   dist/*                     static files from public/ (social image...)
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist");
const serve = process.argv.includes("--serve");
const dev = serve || process.argv.includes("--dev");

/** Short content hash of the data files: changes only when the data changes. */
async function dataVersion() {
  const h = createHash("sha256");
  for (const f of ["taxonomy.json", "nodes.json"]) h.update(await readFile(join(root, "data", f)));
  return h.digest("hex").slice(0, 10);
}

async function writeShell(metafile) {
  const outputs = Object.entries(metafile.outputs);
  const asset = (ext) => {
    const hit = outputs.find(([file, o]) => file.endsWith(ext) && (ext === ".css" || o.entryPoint));
    if (!hit) throw new Error(`build produced no ${ext} entry`);
    return relative(outdir, join(root, hit[0])).split("\\").join("/");
  };
  const template = await readFile(join(root, "index.html"), "utf8");
  const html = template
    .replaceAll("%DATA_VERSION%", await dataVersion())
    .replace("%CSS%", asset(".css"))
    .replace("%JS%", asset(".js"));
  await writeFile(join(outdir, "index.html"), html);
  await cp(join(root, "data"), join(outdir, "data"), { recursive: true });
  await cp(join(root, "public"), outdir, { recursive: true });
  await writeBadges();
  await writeFile(join(outdir, ".nojekyll"), "");
}

/** shields.io "endpoint" badges, regenerated on every deploy so the README stays current. */
async function writeBadges() {
  const nodes = JSON.parse(await readFile(join(root, "data/nodes.json"), "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  const past = nodes.map((n) => n.date).filter((d) => d <= today).sort();
  const badge = (label, message, color) => JSON.stringify({ schemaVersion: 1, label, message, color });
  await mkdir(join(outdir, "badges"), { recursive: true });
  await writeFile(join(outdir, "badges/nodes.json"), badge("nodes", String(nodes.length), "4fd1c5"));
  await writeFile(join(outdir, "badges/latest.json"), badge("latest event", past[past.length - 1] ?? "n/a", "ff5d73"));
}

const options = {
  entryPoints: [join(root, "src/main.tsx")],
  bundle: true,
  format: "esm",
  target: ["es2022", "chrome111", "safari16.4", "firefox115"],
  outdir: join(outdir, "assets"),
  entryNames: dev ? "[name]" : "[name]-[hash]",
  minify: !dev,
  sourcemap: true,
  metafile: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
  logLevel: "info",
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

if (serve) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{ name: "shell", setup(b) { b.onEnd(async (r) => { if (r.metafile) await writeShell(r.metafile); }); } }],
  });
  await ctx.watch();
  const { hosts, port } = await ctx.serve({ servedir: outdir, port: 5173 });
  console.log(`dev server: http://${hosts[0] === "0.0.0.0" ? "localhost" : hosts[0]}:${port}/`);
} else {
  const result = await esbuild.build(options);
  await writeShell(result.metafile);
  const sizes = Object.entries(result.metafile.outputs)
    .filter(([f]) => !f.endsWith(".map"))
    .map(([f, o]) => `  ${relative(root, f)}  ${(o.bytes / 1024).toFixed(1)} KiB`);
  console.log(`built dist/\n${sizes.join("\n")}`);
}
