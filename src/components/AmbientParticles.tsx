import { useEffect, useRef } from "react";

// Site-wide ambient field like mercury.com/command: particles are carried along an
// invisible flow field (flow-field), bunch into curved glowing "rivers", and drift on
// their own — no scroll needed. The field slowly evolves so the currents keep changing.
// Background + particle colour invert per section (dark indigo <-> light).
const BG_DARK = [13, 14, 26], GLOW = [40, 42, 74], BG_LIGHT = [224, 228, 238];
const P_LIGHT = [236, 242, 255], P_DARK = [16, 24, 48];

const SECTIONS: { id: string; l: number }[] = [
  { id: "top", l: 0 },
  { id: "about", l: 1 },
  { id: "works", l: 0 },
  { id: "lab", l: 1 },
  { id: "contact", l: 0 },
];

export default function AmbientParticles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    let W = 0, H = 0, dpr = 1, cw = 0, ch = 0, raf = 0, running = true, t = 0, curL = 0, inited = false, N = 0;
    let x = new Float32Array(0), y = new Float32Array(0), vx = new Float32Array(0), vy = new Float32Array(0);
    let sz = new Float32Array(0), ba = new Float32Array(0), tw = new Float32Array(0), tp = new Float32Array(0);
    let spd = new Float32Array(0), life = new Float32Array(0), age = new Float32Array(0);

    function rspawn(i: number, fresh: boolean) {
      x[i] = Math.random() * cw; y[i] = Math.random() * ch;
      vx[i] = 0; vy[i] = 0;
      const big = Math.random() < 0.09;
      sz[i] = big ? 1.3 + Math.random() * 1.6 : 0.6 + 0.9 * Math.pow(Math.random(), 1.4);
      ba[i] = big ? 0.55 + 0.45 * Math.random() : 0.10 + 0.34 * Math.random();
      tw[i] = 0.5 + Math.random() * 1.5; tp[i] = Math.random() * 6.283;
      spd[i] = 0.5 + Math.random() * 1.0;
      life[i] = 420 + Math.random() * 1000;
      age[i] = fresh ? Math.random() * life[i] : 0;
    }
    function alloc() {
      N = Math.round(Math.min(7000, Math.max(2600, (cw * ch) / 220)));
      x = new Float32Array(N); y = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
      sz = new Float32Array(N); ba = new Float32Array(N); tw = new Float32Array(N); tp = new Float32Array(N);
      spd = new Float32Array(N); life = new Float32Array(N); age = new Float32Array(N);
      for (let i = 0; i < N; i++) rspawn(i, true);
    }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = window.innerWidth; ch = window.innerHeight;
      W = Math.round(cw * dpr); H = Math.round(ch * dpr);
      canvas.width = W; canvas.height = H;
      alloc();
    }
    function flow(px: number, py: number) {
      const n = Math.sin(px * 0.0026 + t * 0.06)
        + Math.cos(py * 0.0031 - t * 0.05)
        + 0.7 * Math.sin((px * 0.9 - py * 1.15) * 0.0028 + t * 0.04)
        + 0.6 * Math.cos((px + py) * 0.0018 - t * 0.03)
        + 0.4 * Math.sin((px * 1.4 + py * 0.6) * 0.0042 + t * 0.05);
      return n * 1.9;
    }
    function targetLightness() {
      const cy = window.scrollY + window.innerHeight / 2;
      let L = 0;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const top = el.offsetTop, bot = top + el.offsetHeight;
        if (cy >= top && cy < bot) return s.l;
        if (cy >= bot) L = s.l;
      }
      return L;
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      t += 0.016;
      const tl = targetLightness();
      if (!inited) { curL = tl; inited = true; }
      curL += (tl - curL) * 0.06;

      const bR = Math.round(BG_DARK[0] + (BG_LIGHT[0] - BG_DARK[0]) * curL);
      const bG = Math.round(BG_DARK[1] + (BG_LIGHT[1] - BG_DARK[1]) * curL);
      const bB = Math.round(BG_DARK[2] + (BG_LIGHT[2] - BG_DARK[2]) * curL);
      ctx.fillStyle = `rgb(${bR},${bG},${bB})`;
      ctx.fillRect(0, 0, W, H);

      const gA = (1 - curL) * 0.85;
      if (gA > 0.01) {
        const g = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, Math.hypot(W, H) * 0.6);
        g.addColorStop(0, `rgba(${GLOW[0]},${GLOW[1]},${GLOW[2]},${gA.toFixed(3)})`);
        g.addColorStop(1, `rgba(${GLOW[0]},${GLOW[1]},${GLOW[2]},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }

      const pR = Math.round(P_LIGHT[0] + (P_DARK[0] - P_LIGHT[0]) * curL);
      const pG = Math.round(P_LIGHT[1] + (P_DARK[1] - P_LIGHT[1]) * curL);
      const pB = Math.round(P_LIGHT[2] + (P_DARK[2] - P_LIGHT[2]) * curL);
      ctx.fillStyle = `rgb(${pR},${pG},${pB})`;
      ctx.globalCompositeOperation = curL < 0.5 ? "lighter" : "source-over";

      for (let i = 0; i < N; i++) {
        const ang = flow(x[i], y[i]);
        const tvx = Math.cos(ang) * 1.05 * spd[i], tvy = Math.sin(ang) * 1.05 * spd[i];
        vx[i] += (tvx - vx[i]) * 0.11; vy[i] += (tvy - vy[i]) * 0.11;
        x[i] += vx[i]; y[i] += vy[i];
        age[i]++;
        if (age[i] > life[i] || x[i] < -6 || x[i] > cw + 6 || y[i] < -6 || y[i] > ch + 6) rspawn(i, false);
        const lf = Math.min(age[i] / 24, (life[i] - age[i]) / 40, 1);
        const twv = 0.6 + 0.4 * Math.sin(t * tw[i] + tp[i]);
        ctx.globalAlpha = Math.max(0, Math.min(1, ba[i] * twv * lf));
        const s = Math.max(1, sz[i] * dpr);
        ctx.fillRect(x[i] * dpr, y[i] * dpr, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    resize();
    raf = requestAnimationFrame(frame);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} className="ambient-canvas" aria-hidden />;
}
