// Orthographic globe for the detail panel. Rotates along the great circle to the
// selected node's location, draws origin→target arcs, and stays idle (no
// animation frames) once it has arrived. Land outlines load lazily on first use.
import { useEffect, useRef, useState } from "react";
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { GeoPoint, Lang } from "../types";
import type { ThemeId } from "../themes";

type LonLat = [number, number];

let landPromise: Promise<GeoPermissibleObjects> | null = null;
function loadLand(): Promise<GeoPermissibleObjects> {
  const version = document.querySelector<HTMLMetaElement>('meta[name="data-version"]')?.content ?? "dev";
  landPromise ??= fetch(`data/geo/land-110m.json?v=${version}`).then((r) => {
    if (!r.ok) throw new Error(`land: HTTP ${r.status}`);
    return r.json() as Promise<GeoPermissibleObjects>;
  });
  return landPromise;
}

interface Palette { ocean: string; land: string; coast: string; grat: string; rim: string; glow: string; text: string; halo: string; warn: string; font: string }
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    ocean: v("--globe-ocean"), land: v("--globe-land"), coast: v("--globe-coast"), grat: v("--globe-grat"),
    rim: v("--globe-rim"), glow: v("--globe-glow"), text: v("--text"), halo: v("--halo") || v("--bg"), warn: v("--warn"),
    font: v("--font-ui") || "sans-serif",
  };
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Point the view should centre on: spherical mean of the origin points. */
function meanOf(points: { lat: number; lon: number }[]): LonLat {
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    const la = (p.lat * Math.PI) / 180, lo = (p.lon * Math.PI) / 180;
    x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
  }
  return [(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI];
}

/** Where to point the camera: the origin, or — when the event reaches other places — the
 *  midpoint between where it started and where it landed, so both ends of the arc are in view. */
function focusOf(points: GeoPoint[]): LonLat {
  const origins = points.filter((p) => (p.role ?? "origin") === "origin");
  const targets = points.filter((p) => p.role === "target");
  if (!origins.length) return meanOf(points);
  if (!targets.length) return meanOf(origins);
  const [olon, olat] = meanOf(origins), [tlon, tlat] = meanOf(targets);
  return meanOf([{ lat: olat, lon: olon }, { lat: tlat, lon: tlon }]);
}

export default function Globe({ points, lang, theme, accent, constraint }: {
  points: GeoPoint[] | undefined; lang: Lang; theme: ThemeId; accent: string; constraint: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [land, setLand] = useState<GeoPermissibleObjects | null>(null);
  const center = useRef<LonLat>([110, 20]); // initial view: Asia-Pacific
  const anim = useRef(0);
  const palette = useRef<Palette | null>(null);

  useEffect(() => { loadLand().then(setLand).catch(() => setLand({ type: "Sphere" })); }, []);
  useEffect(() => { palette.current = readPalette(); }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !land) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = Math.min(W, H) / 2 - 10;
    const projection = geoOrthographic().scale(R).translate([W / 2, H / 2]).clipAngle(90).precision(0.4);
    const path = geoPath(projection, ctx);
    const pal = palette.current ?? (palette.current = readPalette());
    const arcColor = constraint ? pal.warn : accent;
    const pts = points ?? [];
    const origins = pts.filter((p) => (p.role ?? "origin") === "origin");
    const targets = pts.filter((p) => p.role === "target");

    const draw = (c: LonLat, arcT: number, ripple: number) => {
      projection.rotate([-c[0], -c[1]]);
      ctx.clearRect(0, 0, W, H);
      // halo around the limb
      if (pal.glow && pal.glow !== "none") {
        const g = ctx.createRadialGradient(W / 2, H / 2, R * 0.92, W / 2, H / 2, R * 1.12);
        g.addColorStop(0, pal.glow); g.addColorStop(1, "transparent");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = pal.ocean; ctx.fill();
      ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = pal.grat; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.beginPath(); path(land); ctx.fillStyle = pal.land; ctx.fill(); ctx.strokeStyle = pal.coast; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = pal.rim; ctx.lineWidth = 1; ctx.stroke();

      // great-circle arcs origin -> target, drawn progressively
      if (arcT > 0) for (const o of origins) for (const tg of targets) {
        const interp = geoInterpolate([o.lon, o.lat], [tg.lon, tg.lat]);
        const steps = 48, n = Math.max(2, Math.round(steps * arcT));
        const coords: LonLat[] = Array.from({ length: n }, (_, i) => interp((i / (n - 1)) * arcT) as LonLat);
        ctx.beginPath(); path({ type: "LineString", coordinates: coords } as GeoPermissibleObjects);
        ctx.strokeStyle = arcColor; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
      }

      // markers + labels on the visible hemisphere only
      ctx.font = `600 11px ${pal.font}`;
      ctx.textBaseline = "middle";
      for (const p of pts) {
        const ll: LonLat = [p.lon, p.lat];
        if (geoDistance(ll, c) > Math.PI / 2 - 0.02) continue;
        const xy = projection(ll);
        if (!xy) continue;
        const [x, y] = xy;
        const isTarget = p.role === "target";
        const col = isTarget ? arcColor : accent;
        if (!isTarget && ripple > 0) {
          for (const phase of [0, 0.5]) {
            const r = ((ripple + phase) % 1);
            ctx.beginPath(); ctx.arc(x, y, 4 + r * 16, 0, Math.PI * 2);
            ctx.strokeStyle = col; ctx.globalAlpha = (1 - r) * 0.8; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
        ctx.beginPath(); ctx.arc(x, y, isTarget ? 4 : 4.5, 0, Math.PI * 2);
        if (isTarget) { ctx.fillStyle = pal.ocean; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke(); }
        else { ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = pal.halo; ctx.lineWidth = 1.5; ctx.stroke(); }
        const label = p.place[lang];
        const tx = x + 9 + ctx.measureText(label).width > W - 4 ? x - 9 - ctx.measureText(label).width : x + 9;
        ctx.lineWidth = 3; ctx.strokeStyle = pal.halo; ctx.strokeText(label, tx, y);
        ctx.fillStyle = pal.text; ctx.fillText(label, tx, y);
      }
    };

    cancelAnimationFrame(anim.current);
    const from = center.current;
    const to: LonLat = pts.length ? focusOf(pts) : from;
    const dist = geoDistance(from, to);
    const rotateMs = reducedMotion() || !pts.length ? 0 : 450 + 750 * (dist / Math.PI);
    const arcMs = targets.length && !reducedMotion() ? 700 : 0;
    const rippleMs = pts.length && !reducedMotion() ? 2600 : 0;
    const interp = geoInterpolate(from, to);
    const t0 = performance.now();

    const frame = (now: number) => {
      const t = now - t0;
      const k = rotateMs ? Math.min(1, t / rotateMs) : 1;
      const c = interp(ease(k)) as LonLat;
      center.current = c;
      const arcT = targets.length ? (arcMs ? Math.min(1, Math.max(0, (t - rotateMs) / arcMs)) : 1) : 0;
      const rippleT = t - rotateMs;
      const ripple = rippleMs && rippleT > 0 && rippleT < rippleMs ? (rippleT / 1300) % 1 : 0;
      draw(c, arcT, ripple);
      if (t < rotateMs + Math.max(arcMs, rippleMs)) anim.current = requestAnimationFrame(frame);
      else draw(to, targets.length ? 1 : 0, 0); // settle: final static frame, no more work
    };
    anim.current = requestAnimationFrame(frame);

    // Drag to look around; the next selection animates from wherever the user left it.
    let drag: { x: number; y: number; c: LonLat } | null = null;
    const down = (e: PointerEvent) => { cancelAnimationFrame(anim.current); drag = { x: e.clientX, y: e.clientY, c: center.current }; canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const k = 90 / R;
      const lon = drag.c[0] - (e.clientX - drag.x) * k;
      const lat = Math.max(-80, Math.min(80, drag.c[1] + (e.clientY - drag.y) * k));
      center.current = [lon, lat];
      draw(center.current, targets.length ? 1 : 0, 0);
    };
    const up = () => { drag = null; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      cancelAnimationFrame(anim.current);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [points, land, lang, theme, accent, constraint]);

  return <canvas ref={canvasRef} className="globe-canvas" aria-hidden />;
}
