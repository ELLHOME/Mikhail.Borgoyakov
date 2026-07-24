// Ported vanilla scroll/interaction logic, adapted for React + external assets.
export function initSiteEffects(): () => void {
  const ac = new AbortController();
  const sig = { signal: ac.signal, passive: true } as AddEventListenerOptions;
  const observers: IntersectionObserver[] = [];
  const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
  const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
  const $id = (s: string) => document.getElementById(s) as HTMLElement | null;

  // ---- mobile menu ----
  const ov = $id("navOverlay");
  const navToggle = $id("navToggle");
  const navClose = $id("navClose");
  navToggle?.addEventListener("click", () => ov?.classList.add("open"), { signal: ac.signal });
  navClose?.addEventListener("click", () => ov?.classList.remove("open"), { signal: ac.signal });
  ov?.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => ov?.classList.remove("open"), { signal: ac.signal })
  );

  // ---- reveal ----
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { threshold: 0.12 }
  );
  observers.push(io);
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // ---- before/after slider ----
  (() => {
    const s = $id("aboutPhoto");
    if (!s || !s.classList.contains("ba-slider")) return;
    const set = (x: number) => {
      const r = s.getBoundingClientRect();
      let p = ((x - r.left) / r.width) * 100;
      p = Math.max(0, Math.min(100, p));
      s.style.setProperty("--split", p + "%");
    };
    let drag = false;
    s.addEventListener("pointerdown", (e) => { drag = true; if ((e as PointerEvent).pointerType === "mouse") s.setPointerCapture((e as PointerEvent).pointerId); set((e as PointerEvent).clientX); }, { signal: ac.signal });
    s.addEventListener("pointermove", (e) => { if (drag) set((e as PointerEvent).clientX); }, { signal: ac.signal });
    const stop = () => { drag = false; };
    s.addEventListener("pointerup", stop, { signal: ac.signal });
    s.addEventListener("pointercancel", stop, { signal: ac.signal });
    s.addEventListener("pointerleave", () => { drag = false; }, { signal: ac.signal });
  })();

  // ---- hero frame sequence ----
  const hero = $id("top")!;
  const logo = $id("heroLogo")!;
  const lname = logo.querySelector(".l-name") as HTMLElement;
  const scrollInd = $id("scrollInd")!;
  const aboutSec = $id("about");
  const aboutPhoto = $id("aboutPhoto");
  const abL = $id("abL"), abP1 = $id("abP1"), abP2 = $id("abP2"), abT = $id("abT");
  const navEl = $(".nav")!;
  const lightSecs = Array.from(document.querySelectorAll(".section-light, .pt-light")) as HTMLElement[];
  const worksSec = $id("works");
  const wfSpace = $id("wfSpace");
  const wfCards = wfSpace ? (Array.from(wfSpace.querySelectorAll(".wf-card")) as HTMLElement[]) : [];
  const wfNames = wfCards.map((c) => c.querySelector(".wf-name") as HTMLElement | null);
  const wfIntro = $id("wfIntro");
  const wfCur = $id("wfCur");
  let wfLastCur = -1;

  // ---- LAB flythrough refs (case tiles fly out of depth toward the viewer) ----
  const labSec = $id("lab");
  const labDeck = $id("labDeck");
  const labCards = labDeck ? (Array.from(labDeck.querySelectorAll(".lcard")) as HTMLElement[]) : [];
  const labIntro = $id("labIntro");
  const labCur = $id("labCur");
  let labLastCur = -1;
  const canvas = $id("handCanvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const BASE = import.meta.env.BASE_URL;
  const FRAMES = Array.from({ length: 49 }, (_, i) => `${BASE}frames/f${String(i).padStart(2, "0")}.webp`);
  const N = FRAMES.length;
  const imgs = FRAMES.map((src) => { const im = new Image(); im.onload = () => render(); im.src = src; return im; });
  let curIdx = -1, targetIdx = 0;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    curIdx = -1; render();
  }
  const ready = (i: number) => !!imgs[i] && imgs[i].complete && imgs[i].naturalWidth > 0;
  function nearest(i: number) {
    if (ready(i)) return i;
    for (let d = 1; d < N; d++) { if (ready(i - d)) return i - d; if (ready(i + d)) return i + d; }
    return -1;
  }
  function drawIdx(i: number) {
    const cw = canvas.width, ch = canvas.height, im = imgs[i];
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
    if (!im || !im.naturalWidth) return;
    const s = cw / im.naturalWidth;
    const w = cw, h = im.naturalHeight * s;
    ctx.drawImage(im, 0, (ch - h) / 2, w, h);
  }
  function render() { const j = nearest(targetIdx); if (j >= 0 && j !== curIdx) { drawIdx(j); curIdx = j; } }

  let ticking = false;
  function update() {
    const total = hero.offsetHeight - window.innerHeight;
    const p = clamp(total > 0 ? window.scrollY / total : 0, 0, 1);
    const fp = clamp(p / 0.92, 0, 1);
    targetIdx = Math.round(fp * (N - 1));
    render();
    logo.style.opacity = String(clamp((p - 0.9) / 0.08, 0, 1));
    const g = clamp((p - 0.84) / 0.16, 0, 1);
    lname.style.textShadow = `0 0 ${(16 + g * 48).toFixed(0)}px rgba(150,200,255,${(0.4 + g * 0.55).toFixed(2)}), 0 0 ${(40 + g * 150).toFixed(0)}px rgba(70,140,255,${(g * 0.75).toFixed(2)})`;
    scrollInd.style.opacity = String(1 - clamp(p / 0.12, 0, 1));
    updateAbout();
    updateWorks();
    updateLab();
    navTheme();
    ticking = false;
  }
  function navTheme() {
    let light = false;
    for (let i = 0; i < lightSecs.length; i++) { const r = lightSecs[i].getBoundingClientRect(); if (r.top <= 34 && r.bottom > 34) { light = true; break; } }
    navEl.classList.toggle("nav-on-light", light);
  }
  // ---- WORKS: projects fly out of depth toward the viewer ----
  function updateWorks() {
    if (!worksSec || !wfCards.length) return;
    const N = wfCards.length;
    const range = worksSec.offsetHeight - window.innerHeight;
    if (range <= 0) {
      wfCards.forEach((c, i) => { c.style.transform = "translate(-50%,-50%) scale(1)"; c.style.opacity = i === 0 ? "1" : "0"; c.style.filter = "none"; });
      return;
    }
    const q = clamp((window.scrollY - worksSec.offsetTop) / range, 0, 1);
    const span = 1 / (N + 1);

    if (wfIntro) {
      const io = 1 - clamp(q / 0.09, 0, 1);
      wfIntro.style.opacity = io.toFixed(3);
      wfIntro.style.transform = `translateY(${(-50 - (1 - io) * 22).toFixed(1)}%)`;
      wfIntro.style.filter = io < 0.98 ? `blur(${((1 - io) * 6).toFixed(1)}px)` : "none";
      wfIntro.style.pointerEvents = io < 0.05 ? "none" : "auto";
    }

    let focusIdx = 0, focusMin = 99;
    for (let i = 0; i < N; i++) {
      const qi = (i + 1) * span;
      const x = (q - qi) / span;            // card-units: 0 at focus, ±1 = one card away
      const ax = Math.abs(x);
      if (ax < focusMin) { focusMin = ax; focusIdx = i; }

      let scale: number, opacity: number, blur: number, glow: number;
      if (x <= 0) {
        // approaching from far in the depth
        let t = clamp((x + 1.2) / 1.2, 0, 1); t = t * t * (3 - 2 * t);
        scale = 0.24 + 0.76 * t;
        opacity = clamp((x + 1.04) / 0.52, 0, 1);
        blur = (1 - t) * 11;
        glow = t;
      } else {
        // blowing up huge and dissolving as it rushes past the viewer
        const u = clamp(x / 0.95, 0, 1), ue = u * u;
        scale = 1 + 3.6 * ue;
        opacity = 1 - clamp((x - 0.16) / 0.6, 0, 1);
        blur = ue * 16;
        glow = 1 - ue;
      }

      const c = wfCards[i];
      c.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(3)})`;
      c.style.opacity = opacity.toFixed(3);
      c.style.filter = blur > 0.06 ? `blur(${blur.toFixed(1)}px)` : "none";
      c.style.zIndex = String(Math.round(500 - ax * 120));
      const nm = wfNames[i];
      if (nm) {
        const g = clamp(glow, 0, 1);
        nm.style.textShadow = g > 0.04
          ? `0 0 ${(8 + g * 34).toFixed(0)}px rgba(120,180,255,${(g * 0.5).toFixed(2)})`
          : "none";
      }
    }
    if (wfCur && focusIdx !== wfLastCur) { wfCur.textContent = String(focusIdx + 1).padStart(2, "0"); wfLastCur = focusIdx; }
  }

  // ---- LAB: case tiles fly out of depth toward the viewer (same feel as Works) ----
  function updateLab() {
    if (!labSec || !labCards.length) return;
    const N = labCards.length;
    const range = labSec.offsetHeight - window.innerHeight;
    if (range <= 0) {
      labCards.forEach((c, i) => { c.style.transform = "translate(-50%,-50%) scale(1)"; c.style.opacity = i === 0 ? "1" : "0"; c.style.filter = "none"; });
      return;
    }
    const q = clamp((window.scrollY - labSec.offsetTop) / range, 0, 1);
    const span = 1 / (N + 1);

    if (labIntro) {
      const io = 1 - clamp(q / 0.08, 0, 1);
      labIntro.style.opacity = io.toFixed(3);
      labIntro.style.transform = `translateY(${(-50 - (1 - io) * 22).toFixed(1)}%)`;
      labIntro.style.filter = io < 0.98 ? `blur(${((1 - io) * 6).toFixed(1)}px)` : "none";
      labIntro.style.pointerEvents = io < 0.05 ? "none" : "auto";
    }

    let focusIdx = 0, focusMin = 99;
    for (let i = 0; i < N; i++) {
      const qi = (i + 1) * span;
      const x = (q - qi) / span;                 // card-units: 0 at focus, ±1 = one card away
      const ax = Math.abs(x);
      if (ax < focusMin) { focusMin = ax; focusIdx = i; }

      let scale: number, opacity: number, blur: number;
      if (x <= 0) {
        // approaching from the depth
        let t = clamp((x + 1.2) / 1.2, 0, 1); t = t * t * (3 - 2 * t);
        scale = 0.34 + 0.66 * t;
        opacity = clamp((x + 1.05) / 0.5, 0, 1);
        blur = (1 - t) * 8;
      } else {
        // rushing past the viewer, growing
        const u = clamp(x / 0.95, 0, 1), ue = u * u;
        scale = 1 + 1.7 * ue;
        opacity = 1 - clamp((x - 0.14) / 0.6, 0, 1);
        blur = ue * 9;
      }

      const c = labCards[i];
      c.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(3)})`;
      c.style.opacity = opacity.toFixed(3);
      c.style.filter = blur > 0.06 ? `blur(${blur.toFixed(1)}px)` : "none";
      c.style.zIndex = String(Math.round(500 - ax * 120));
    }
    if (labCur && focusIdx !== labLastCur) { labCur.textContent = String(focusIdx + 1).padStart(2, "0"); labLastCur = focusIdx; }
  }
  function seg(e: HTMLElement | null, v: number, s: number, sp: number) { if (!e) return; const t = clamp((v - s) / sp, 0, 1); e.style.opacity = t.toFixed(3); e.style.transform = `translateY(${((1 - t) * 26).toFixed(1)}px)`; }
  function updateAbout() {
    if (!aboutSec || !aboutPhoto) return;
    const range = aboutSec.offsetHeight - window.innerHeight;
    if (window.innerWidth <= 820 || range <= 0) {
      aboutPhoto.style.opacity = "1"; aboutPhoto.style.filter = "none";
      [abL, abP1, abP2, abT].forEach((e) => { if (e) { e.style.opacity = "1"; e.style.transform = "none"; } });
      return;
    }
    const q = clamp((window.scrollY - aboutSec.offsetTop) / range, 0, 1);
    aboutPhoto.style.opacity = clamp(q / 0.12, 0, 1).toFixed(3);
    seg(abL, q, 0.10, 0.16); seg(abP1, q, 0.34, 0.15); seg(abP2, q, 0.50, 0.15); seg(abT, q, 0.66, 0.15);
  }

  window.addEventListener("scroll", () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, sig);
  window.addEventListener("resize", () => { fit(); update(); }, { signal: ac.signal });
  window.addEventListener("load", () => { update(); }, { signal: ac.signal });
  fit(); update();

  return () => { ac.abort(); observers.forEach((o) => o.disconnect()); };
}
