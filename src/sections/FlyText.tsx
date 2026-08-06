import { useEffect, useRef, useState } from "react";
import { PItem } from "./ParticleText";

function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
type Word = { nameSize: number; dSize: number; nameY: number; descY: number };

export default function FlyText({
  id, eyebrow, items, theme, intro,
}: { id: string; eyebrow: string; items: PItem[]; theme: "dark" | "light"; intro?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(0);
  const N = items.length;
  const textRGB = theme === "dark" ? "224,235,255" : "18,26,48";

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    const sec = document.getElementById(id)!;
    let W = 0, H = 0, dpr = 1, raf = 0, running = true, lastActive = -1, ready = false;
    let words: Word[] = [];

    function measure() {
      words = items.map((p) => {
        let nameSize = Math.min(W * 0.12, 210 * dpr);
        ctx.font = `500 ${nameSize}px Montserrat, sans-serif`;
        const nameW = ctx.measureText(p.t).width, maxNameW = W * 0.86;
        if (nameW > maxNameW) nameSize *= maxNameW / nameW;
        let dSize = Math.max(W * 0.021, 18 * dpr);
        ctx.font = `500 ${dSize}px Montserrat, sans-serif`;
        const dW = ctx.measureText(p.d).width, maxDW = W * 0.7;
        if (dW > maxDW) dSize *= maxDW / dW;
        const nameY = H * 0.44 - H / 2;
        const descY = H * 0.44 + nameSize * 0.66 - H / 2;
        return { nameSize, dSize, nameY, descY };
      });
    }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(canvas.clientWidth * dpr);
      H = Math.round(canvas.clientHeight * dpr);
      canvas.width = W; canvas.height = H;
      measure();
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

      // fly toward viewer: readable around the middle, fades before the next arrives
      const scale = 0.55 + local * 1.5;
      const op = smooth(0, 0.14, local) * (1 - smooth(0.8, 1, local));

      ctx.clearRect(0, 0, W, H);
      if (op > 0.004) {
        ctx.save();
        ctx.globalAlpha = op;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.fillStyle = `rgb(${textRGB})`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `500 ${w.nameSize}px Montserrat, sans-serif`;
        ctx.fillText(it.t, 0, w.nameY);
        try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${Math.round(dpr * 4)}px`; } catch { /* noop */ }
        ctx.font = `500 ${w.dSize}px Montserrat, sans-serif`;
        ctx.fillText(it.d, 0, w.descY);
        try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px"; } catch { /* noop */ }
        ctx.restore();
      }

      const introEl = document.getElementById(`${id}Intro`);
      if (introEl) introEl.style.opacity = String(1 - smooth(0, 0.05, q));
      if (idx !== lastActive) { lastActive = idx; setActive(idx); }
    }
    const start = () => { if (ready) return; ready = true; resize(); raf = requestAnimationFrame(frame); };
    (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(start) ?? start();
    setTimeout(start, 600);
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = window.setTimeout(resize, 200); };
    window.addEventListener("resize", onResize);
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); clearTimeout(rt); };
  }, [id, items, N, textRGB]);

  const p = items[active];
  return (
    <section id={id} className={`pt-sec pt-${theme}`}>
      <div className="pt-stage">
        <canvas ref={canvasRef} className="pt-canvas" />
        <div className="pt-eyebrow track-sm">{eyebrow}</div>
        {intro && (
          <div className="fly-intro" id={`${id}Intro`}>
            <p className="sec-intro">{intro}</p>
          </div>
        )}
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
