import { useEffect, useRef, useState } from "react";
import { PItem } from "./ParticleText";

const PCOUNT = 9000;
function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

type Word = { rel: Float32Array; nameSize: number; dSize: number; nameY: number; descY: number };

export default function WorksFly({ id, eyebrow, items }: { id: string; eyebrow: string; items: PItem[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(0);
  const N = items.length;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    const sec = document.getElementById(id)!;
    let W = 0, H = 0, dpr = 1, raf = 0, running = true, lastActive = -1, ready = false;

    const dR = new Float32Array(PCOUNT), dA = new Float32Array(PCOUNT), pb = new Float32Array(PCOUNT);
    for (let i = 0; i < PCOUNT; i++) { dR[i] = 30 + Math.random() * 200; dA[i] = Math.random() * Math.PI * 2; pb[i] = 0.55 + Math.random() * 0.45; }

    let words: Word[] = [];
    function sampleAll() { words = items.map(sampleWord); }
    function sampleWord(p: PItem): Word {
      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const c = off.getContext("2d")!;
      c.clearRect(0, 0, W, H);
      c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
      let nameSize = Math.min(W * 0.12, 210 * dpr);
      c.font = `500 ${nameSize}px Montserrat, sans-serif`;
      const nameW = c.measureText(p.t).width, maxNameW = W * 0.82;
      if (nameW > maxNameW) { nameSize *= maxNameW / nameW; c.font = `500 ${nameSize}px Montserrat, sans-serif`; }
      const nameY = H * 0.44;
      c.fillText(p.t, W / 2, nameY);
      let dSize = Math.max(W * 0.02, 17 * dpr);
      try { (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${Math.round(dpr * 4)}px`; } catch { /* noop */ }
      c.font = `500 ${dSize}px Montserrat, sans-serif`;
      const dW = c.measureText(p.d).width, maxDW = W * 0.64;
      if (dW > maxDW) { dSize *= maxDW / dW; c.font = `500 ${dSize}px Montserrat, sans-serif`; }
      const descY = nameY + nameSize * 0.66;
      c.fillText(p.d, W / 2, descY);
      // sample points relative to centre (for the dissolve)
      const data = c.getImageData(0, 0, W, H).data;
      const step = Math.max(2, Math.round(W / 900));
      const pts: number[] = [];
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        if (data[(y * W + x) * 4 + 3] > 120) pts.push(x - W / 2, y - H / 2);
      }
      let rel = new Float32Array(pts);
      const count = pts.length / 2;
      if (count > PCOUNT) {
        const out = new Float32Array(PCOUNT * 2);
        for (let i = 0; i < PCOUNT; i++) { const j = Math.floor(Math.random() * count); out[i * 2] = pts[j * 2]; out[i * 2 + 1] = pts[j * 2 + 1]; }
        rel = out;
      }
      return { rel, nameSize, dSize, nameY: nameY - H / 2, descY: descY - H / 2 };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(canvas.clientWidth * dpr);
      H = Math.round(canvas.clientHeight * dpr);
      canvas.width = W; canvas.height = H;
      sampleAll();
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      const r = sec.getBoundingClientRect();
      if (r.bottom < -100 || r.top > window.innerHeight + 100) return;
      const range = sec.offsetHeight - window.innerHeight;
      const q = range > 0 ? Math.max(0, Math.min(1, (window.scrollY - sec.offsetTop) / range)) : 0;
      const seg = q * N;
      let idx = Math.floor(seg); if (idx >= N) idx = N - 1;
      const local = seg - idx;
      const w = words[idx]; const it = items[idx];
      const cx = W / 2, cy = H / 2;

      // fly toward the viewer: continuous enlarge; readable around the middle
      const scale = 0.5 + local * 1.7;
      const op = smooth(0, 0.12, local) * (1 - smooth(0.88, 1, local));

      ctx.clearRect(0, 0, W, H);

      // the solid word turns INTO particles in place, then those particles scatter — no doubling
      const solidA = op * (1 - smooth(0.5, 0.62, local));    // solid gone by ~0.62
      const pAppear = smooth(0.52, 0.64, local);             // particles fade in on the letters
      const pSpread = smooth(0.62, 0.92, local);             // then they fly apart

      if (solidA > 0.01) {
        ctx.save();
        ctx.globalAlpha = solidA;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.fillStyle = "rgb(222,234,255)";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `500 ${w.nameSize}px Montserrat, sans-serif`;
        ctx.fillText(it.t, 0, w.nameY);
        try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${Math.round(dpr * 4)}px`; } catch { /* noop */ }
        ctx.font = `500 ${w.dSize}px Montserrat, sans-serif`;
        ctx.fillText(it.d, 0, w.descY);
        try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px"; } catch { /* noop */ }
        ctx.restore();
      }

      if (pAppear > 0.005) {
        const rel = w.rel; const len = rel.length / 2;
        for (let i = 0; i < PCOUNT; i++) {
          const k = (i % len) * 2;
          const disp = pSpread * dR[i] * dpr * 1.6;
          const x = cx + rel[k] * scale + Math.cos(dA[i]) * disp;
          const y = cy + rel[k + 1] * scale + Math.sin(dA[i]) * disp;
          const a = op * pAppear * pb[i];
          if (a < 0.015) continue;
          ctx.fillStyle = `rgba(222,234,255,${a.toFixed(3)})`;
          const s = Math.max(1, Math.round((pb[i] > 0.8 ? 2.4 : 1.7) * dpr));
          ctx.fillRect(x, y, s, s);
        }
      }

      const intro = document.getElementById("worksIntro");
      if (intro) intro.style.opacity = String(1 - smooth(0, 0.05, q));
      if (idx !== lastActive) { lastActive = idx; setActive(idx); }
    }

    const start = () => { if (ready) return; ready = true; resize(); raf = requestAnimationFrame(frame); };
    (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(start) ?? start();
    setTimeout(start, 600);
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = window.setTimeout(resize, 200); };
    window.addEventListener("resize", onResize);
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); clearTimeout(rt); };
  }, [id, items, N]);

  const p = items[active];
  return (
    <section id={id} className="pt-sec pt-dark">
      <div className="pt-stage">
        <canvas ref={canvasRef} className="pt-canvas" />
        <div className="pt-eyebrow track-sm">{eyebrow}</div>
        <div className="works-intro" id="worksIntro">
          <h2 className="sec-title">Что я <b>делаю</b>.</h2>
          <p className="sec-intro">Полный цикл цифрового продукта — от идеи и дизайна до кода, движения и запуска.</p>
        </div>
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
