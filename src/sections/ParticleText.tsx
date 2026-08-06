import { useEffect, useRef, useState } from "react";

export type PItem = { n: string; t: string; d: string; tags?: string[] };

const POOL = 11000;
function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const THEME = {
  dark: { rgb: "214,228,255", aMul: 1.0 },
  light: { rgb: "40,60,110", aMul: 1.5 },
};

export default function ParticleText({
  id, eyebrow, items, theme, palette,
}: {
  id: string; eyebrow: string; items: PItem[];
  theme: "dark" | "light"; palette?: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(0);
  const N = items.length;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    const sec = document.getElementById(id)!;
    const baseRgb = THEME[theme].rgb, aMul = THEME[theme].aMul;
    let W = 0, H = 0, dpr = 1, raf = 0, running = true, lastActive = -1, t = 0, ready = false;

    const px = new Float32Array(POOL), py = new Float32Array(POOL);
    const hx = new Float32Array(POOL), hy = new Float32Array(POOL);
    const ph = new Float32Array(POOL), pr = new Float32Array(POOL), spd = new Float32Array(POOL);
    const sz = new Float32Array(POOL), br = new Float32Array(POOL);
    const pcol: string[] = new Array(POOL);       // per-particle colour (multi-colour on light)
    for (let i = 0; i < POOL; i++) {
      ph[i] = Math.random() * Math.PI * 2;
      pr[i] = 10 + Math.random() * 46;
      spd[i] = 0.25 + Math.random() * 0.5;
      sz[i] = Math.random() < 0.3 ? 2.7 : 1.8;
      br[i] = 0.7 + Math.random() * 0.3;
      pcol[i] = palette && palette.length ? palette[Math.floor(Math.random() * palette.length)] : baseRgb;
    }

    let targets: Float32Array[] = [];
    function sampleAll() {
      targets = items.map(sampleItem);
      for (let i = 0; i < POOL; i++) {
        const ang = Math.random() * Math.PI * 2, rad = Math.pow(Math.random(), 0.7);
        hx[i] = W / 2 + Math.cos(ang) * rad * W * 0.46;
        hy[i] = H / 2 + Math.sin(ang) * rad * H * 0.44;
      }
    }
    function sampleItem(p: PItem): Float32Array {
      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const c = off.getContext("2d")!;
      c.clearRect(0, 0, W, H);
      c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
      let nameSize = Math.min(W * 0.12, 210 * dpr);
      c.font = `500 ${nameSize}px Montserrat, sans-serif`;
      const maxNameW = W * 0.84;
      const nameW = c.measureText(p.t).width;
      if (nameW > maxNameW) { nameSize *= maxNameW / nameW; c.font = `500 ${nameSize}px Montserrat, sans-serif`; }
      c.fillText(p.t, W / 2, H * 0.43);
      let dSize = Math.max(W * 0.023, 19 * dpr);
      try { (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${Math.round(dpr * 4)}px`; } catch { /* noop */ }
      c.font = `500 ${dSize}px Montserrat, sans-serif`;
      const maxDW = W * 0.66;
      const dW = c.measureText(p.d).width;
      if (dW > maxDW) { dSize *= maxDW / dW; c.font = `500 ${dSize}px Montserrat, sans-serif`; }
      c.fillText(p.d, W / 2, H * 0.43 + nameSize * 0.66);
      const data = c.getImageData(0, 0, W, H).data;
      const step = Math.max(2, Math.round(W / 1200));
      const pts: number[] = [];
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        if (data[(y * W + x) * 4 + 3] > 120) pts.push(x + (Math.random() - 0.5) * step * 0.4, y + (Math.random() - 0.5) * step * 0.4);
      }
      let arr = new Float32Array(pts);
      const count = pts.length / 2;
      if (count > POOL) {
        const out = new Float32Array(POOL * 2);
        for (let i = 0; i < POOL; i++) { const j = Math.floor(Math.random() * count); out[i * 2] = pts[j * 2]; out[i * 2 + 1] = pts[j * 2 + 1]; }
        arr = out;
      }
      return arr;
    }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(canvas.clientWidth * dpr);
      H = Math.round(canvas.clientHeight * dpr);
      canvas.width = W; canvas.height = H;
      sampleAll();
      for (let i = 0; i < POOL; i++) { px[i] = hx[i]; py[i] = hy[i]; }
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      const r = sec.getBoundingClientRect();
      if (r.bottom < -100 || r.top > window.innerHeight + 100) return;
      t += 0.016;
      const range = sec.offsetHeight - window.innerHeight;
      const q = range > 0 ? Math.max(0, Math.min(1, (window.scrollY - sec.offsetTop) / range)) : 0;
      const seg = q * N;
      let idx = Math.floor(seg); if (idx >= N) idx = N - 1;
      const local = seg - idx;
      const pts = targets[idx]; const len = pts.length / 2;

      ctx.clearRect(0, 0, W, H);
      const ease = 0.15, cx = W / 2, cy = H / 2;
      const gA = t * 0.05, cg = Math.cos(gA), sg = Math.sin(gA);
      const floatX = Math.sin(t * 0.4) * 12 * dpr, floatY = Math.cos(t * 0.31) * 10 * dpr;
      const liveAmp = 1.6 * dpr;   // very subtle shimmer — keeps letters tight & readable

      // slow, readable pacing: long hold in the middle of each band
      const enter = smooth(0.05, 0.32, local);
      const scatter = 1 - smooth(0.70, 0.94, local);
      const form = Math.min(enter, scatter);

      for (let i = 0; i < POOL; i++) {
        const k = (i % len) * 2;
        const tx0 = pts[k], ty0 = pts[k + 1];
        const bx = hx[i] - cx, by = hy[i] - cy;
        const baseX = cx + bx * cg - by * sg, baseY = cy + bx * sg + by * cg;
        const a1 = ph[i] + t * spd[i], a2 = ph[i] * 1.7 + t * spd[i] * 0.6;
        const hX = baseX + Math.cos(a1) * pr[i] + Math.sin(a2) * pr[i] * 0.5;
        const hY = baseY + Math.sin(a1) * pr[i] * 0.85 + Math.cos(a2) * pr[i] * 0.4;

        // gather cloud -> text; keep a lively wander + whole-word float even when assembled
        const bx2 = hX + (tx0 - hX) * form, by2 = hY + (ty0 - hY) * form;
        const live = Math.cos(a1 + t * 0.5) * liveAmp;
        const liveY = Math.sin(a1 * 1.1 + t * 0.5) * liveAmp;
        const targetX = bx2 + live + floatX * form;
        const targetY = by2 + liveY + floatY * form;
        const tw = 0.78 + 0.22 * Math.sin(t * 1.8 + ph[i] * 5);
        const alpha = Math.min(1, br[i] * (0.55 + 0.45 * form) * tw * aMul);

        px[i] += (targetX - px[i]) * ease;
        py[i] += (targetY - py[i]) * ease;
        ctx.fillStyle = `rgba(${pcol[i]},${alpha.toFixed(3)})`;
        const s = Math.max(1, Math.round((form > 0.6 ? sz[i] : sz[i] * 0.92) * dpr));
        ctx.fillRect(px[i], py[i], s, s);
      }
      if (idx !== lastActive) { lastActive = idx; setActive(idx); }
    }

    const start = () => { if (ready) return; ready = true; resize(); raf = requestAnimationFrame(frame); };
    (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(start) ?? start();
    setTimeout(start, 600);
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = window.setTimeout(resize, 200); };
    window.addEventListener("resize", onResize);
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); clearTimeout(rt); };
  }, [id, theme, items, N, palette]);

  const p = items[active];
  return (
    <section id={id} className={`pt-sec pt-${theme}`}>
      <div className="pt-stage">
        <canvas ref={canvasRef} className="pt-canvas" />
        <div className="pt-eyebrow track-sm">{eyebrow}</div>
        {p.tags && (
          <div className="pt-tags">
            {p.tags.map((tg) => <span className="pt-tag track-sm" key={tg}>{tg}</span>)}
          </div>
        )}
        <div className="pt-counter track-sm">
          <span>{p.n}</span><span className="pt-slash">/</span><span>{String(N).padStart(2, "0")}</span>
        </div>
      </div>
    </section>
  );
}
