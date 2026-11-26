/**
 * Home hero: a glass sphere filled with glowing liquid. The liquid level is today's progress,
 * so every workout minute, burned calorie and glass of water visibly raises it.
 */

const MIN_LEVEL = 0.05;
let shownLevel = MIN_LEVEL;
let shownPct = 0;
let current = null;

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) current?.resume();
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const levelFor = (p) => MIN_LEVEL + (1 - MIN_LEVEL) * clamp(p, 0, 1);

export function mountHeroOrb(root, progress) {
  current?.stop();
  current = null;
  if (!root) return;
  const canvas = root.querySelector('.hero-fx');
  const orb = root.querySelector('.hero-orb');
  const num = root.querySelector('.hero-pct-num');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx || !orb) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = levelFor(progress);
  const targetPct = Math.round(clamp(progress, 0, 1) * 100);
  const fromLevel = reduce ? target : shownLevel;
  const fromPct = reduce ? targetPct : shownPct;
  if (num) num.textContent = String(fromPct);
  const t0 = performance.now();
  const FILL_MS = 1900;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let visible = true;
  let lastT = t0;
  let prevLevel = fromLevel;
  let slosh = 0;
  const dust = [];
  const bubbles = [];

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = r.width;
    h = r.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const want = w < 600 ? 40 : 80;
    while (dust.length < want) {
      dust.push({ x: Math.random() * w, y: Math.random() * h, r: 0.4 + Math.random() * 1.2, vy: -(3 + Math.random() * 9), vx: (Math.random() - 0.5) * 4, ph: Math.random() * 6.28 });
    }
    dust.length = want;
    if (reduce) draw(performance.now());
  };

  function spawnBubble(R, fresh) {
    return {
      u: (Math.random() - 0.5) * 1.5,
      y: fresh ? Math.random() : 0,
      r: R * (0.012 + Math.random() * 0.03),
      v: 0.1 + Math.random() * 0.16,
      ph: Math.random() * 6.28,
    };
  }

  function draw(now) {
    const t = now / 1000;
    const k = easeOutExpo(clamp((now - t0) / FILL_MS, 0, 1));
    const level = fromLevel + (target - fromLevel) * k;
    const dt = Math.min(0.05, (now - lastT) / 1000) || 0.016;
    lastT = now;
    slosh = Math.max(slosh * 0.985, Math.min(0.09, (Math.abs(level - prevLevel) / dt) * 0.05));
    prevLevel = level;
    shownLevel = level;
    const pct = Math.round(fromPct + (targetPct - fromPct) * k);
    if (num && pct !== shownPct) num.textContent = String(pct);
    shownPct = pct;

    const cr = canvas.getBoundingClientRect();
    const or = orb.getBoundingClientRect();
    const R = or.width / 2;
    if (R < 8 || w < 1) return;
    const cx = or.left - cr.left + R;
    const cy = or.top - cr.top + R;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    for (const p of dust) {
      if (!reduce) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;
      }
      const a = 0.16 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.4 + p.ph));
      ctx.fillStyle = `rgba(150, 232, 255, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fill();
    }
    const halo = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.6);
    halo.addColorStop(0, `rgba(0, 170, 235, ${(0.16 + 0.16 * level).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(0, 170, 235, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - R * 1.7, cy - R * 1.7, R * 3.4, R * 3.4);
    ctx.globalCompositeOperation = 'source-over';

    // Glass body behind the liquid
    const body = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    body.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
    body.addColorStop(0.72, 'rgba(120, 220, 255, 0.04)');
    body.addColorStop(1, 'rgba(150, 230, 255, 0.16)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 6.2832);
    ctx.fill();

    // Liquid
    const Ri = R * 0.955;
    const surf = cy + Ri - 2 * Ri * level;
    const A = R * (0.03 + slosh);
    const kx = 2.4 / R;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Ri, 0, 6.2832);
    ctx.clip();
    const wave = (phase, speed, amp, mul) => {
      ctx.beginPath();
      ctx.moveTo(cx - Ri, cy + Ri);
      for (let x = cx - Ri; x <= cx + Ri + 1; x += 4) {
        const y = surf + amp * Math.sin((x - cx) * kx * mul + t * speed + phase) + amp * 0.35 * Math.sin((x - cx) * kx * 2.3 - t * speed * 1.4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cx + Ri, cy + Ri);
      ctx.closePath();
    };
    wave(1.7, 1.2, A * 1.1, 0.9);
    ctx.fillStyle = 'rgba(0, 120, 200, 0.55)';
    ctx.fill();
    wave(0, -1.7, A, 1.2);
    const liq = ctx.createLinearGradient(0, surf - A, 0, cy + Ri);
    liq.addColorStop(0, 'rgba(120, 242, 255, 0.95)');
    liq.addColorStop(0.35, 'rgba(20, 190, 245, 0.85)');
    liq.addColorStop(1, 'rgba(0, 70, 160, 0.92)');
    ctx.fillStyle = liq;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const deep = ctx.createRadialGradient(cx, cy + Ri * 0.7, 0, cx, cy + Ri * 0.7, Ri);
    deep.addColorStop(0, 'rgba(60, 220, 255, 0.35)');
    deep.addColorStop(1, 'rgba(60, 220, 255, 0)');
    ctx.fillStyle = deep;
    ctx.fillRect(cx - Ri, surf - A * 2, Ri * 2, cy + Ri - surf + A * 2);
    while (bubbles.length < 16) bubbles.push(spawnBubble(R, true));
    for (const b of bubbles) {
      if (!reduce) b.y += b.v * dt;
      const by = cy + Ri - b.y * (cy + Ri - surf);
      const bx = cx + b.u * Ri * 0.6 + Math.sin(t * 2 + b.ph) * R * 0.02;
      if (by - b.r < surf + A) { Object.assign(b, spawnBubble(R, false)); continue; }
      ctx.strokeStyle = 'rgba(220, 250, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, b.r, 0, 6.2832);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(bx - b.r * 0.35, by - b.r * 0.35, b.r * 0.28, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
    // bright meniscus along the surface
    ctx.beginPath();
    for (let x = cx - Ri; x <= cx + Ri + 1; x += 4) {
      const y = surf + A * Math.sin((x - cx) * kx * 1.2 - t * 1.7) + A * 0.35 * Math.sin((x - cx) * kx * 2.3 + t * 2.38);
      if (x === cx - Ri) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(225, 252, 255, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(120, 240, 255, 0.9)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Glass front: rim, caustic and highlights
    const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    rim.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    rim.addColorStop(0.45, 'rgba(180, 235, 255, 0.18)');
    rim.addColorStop(1, 'rgba(90, 225, 255, 0.6)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 0.8, 0, 6.2832);
    ctx.stroke();
    // Fresnel: glass looks thicker and brighter towards the edge
    const fres = ctx.createRadialGradient(cx, cy, R * 0.78, cx, cy, R);
    fres.addColorStop(0, 'rgba(160, 235, 255, 0)');
    fres.addColorStop(1, 'rgba(160, 235, 255, 0.2)');
    ctx.fillStyle = fres;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 6.2832);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // light from the liquid scattered along the lower rim
    const low = ctx.createLinearGradient(0, cy, 0, cy + R);
    low.addColorStop(0, 'rgba(90, 235, 255, 0)');
    low.addColorStop(1, 'rgba(90, 235, 255, 0.5)');
    ctx.strokeStyle = low;
    ctx.lineWidth = R * 0.02;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.975, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
    // window-light crescent, top left
    const arcA = Math.PI * 1.08;
    const arcB = Math.PI * 1.42;
    const sx = (a) => cx + Math.cos(a) * R * 0.84;
    const sy = (a) => cy + Math.sin(a) * R * 0.84;
    const crest = ctx.createLinearGradient(sx(arcA), sy(arcA), sx(arcB), sy(arcB));
    crest.addColorStop(0, 'rgba(255, 255, 255, 0)');
    crest.addColorStop(0.55, 'rgba(255, 255, 255, 0.62)');
    crest.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
    ctx.strokeStyle = crest;
    ctx.lineWidth = R * 0.055;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.84, arcA, arcB);
    ctx.stroke();
    const glint = ctx.createRadialGradient(cx + R * 0.5, cy - R * 0.55, 0, cx + R * 0.5, cy - R * 0.55, R * 0.08);
    glint.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glint;
    ctx.fillRect(cx + R * 0.36, cy - R * 0.69, R * 0.28, R * 0.28);
    ctx.globalCompositeOperation = 'source-over';
  }

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  if (reduce) {
    if (num) num.textContent = String(targetPct);
    shownLevel = target;
    shownPct = targetPct;
    current = { stop: () => ro.disconnect(), resume: () => {} };
    return;
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
  });
  io.observe(root);

  function frame(now) {
    raf = 0;
    if (!root.isConnected) { stop(); return; }
    if (!visible || document.hidden) return;
    draw(now);
    raf = requestAnimationFrame(frame);
  }
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    ro.disconnect();
    io.disconnect();
    if (current?.stop === stop) current = null;
  };
  current = {
    stop,
    resume: () => {
      if (root.isConnected && !raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
    },
  };
  raf = requestAnimationFrame(frame);
}
