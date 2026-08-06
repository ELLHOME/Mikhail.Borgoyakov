import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type LabItem = { n: string; t: string; d: string; about: string; tags?: string[] };

// LAB — спокойная «редакторская» раскладка (в отличие от налетающего текста в «Работах»):
// название проекта справа, короткое описание + стек слева. Проекты сменяются по скроллу.
export default function LabSplit({
  id, eyebrow, items, intro,
}: { id: string; eyebrow: string; items: LabItem[]; intro?: string }) {
  const [active, setActive] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const N = items.length;

  // подгоняем крупное имя под ширину колонки (длинные названия не должны вылезать)
  useLayoutEffect(() => {
    const fit = () => {
      const el = nameRef.current; if (!el) return;
      const col = el.parentElement as HTMLElement | null; if (!col) return;
      el.style.fontSize = "";
      const budget = col.clientWidth;
      if (el.scrollWidth > budget && budget > 0) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${fs * (budget / el.scrollWidth)}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [active]);

  useEffect(() => {
    const sec = document.getElementById(id)!;
    let raf = 0, running = true, last = -1;
    function frame() {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      const r = sec.getBoundingClientRect();
      if (r.bottom < -100 || r.top > window.innerHeight + 100) return;
      const range = sec.offsetHeight - window.innerHeight;
      const q = range > 0 ? Math.max(0, Math.min(1, (window.scrollY - sec.offsetTop) / range)) : 0;
      const seg = q * N;
      let idx = Math.floor(seg); if (idx >= N) idx = N - 1; if (idx < 0) idx = 0;
      const local = seg - idx;
      const stage = stageRef.current;
      if (stage) stage.style.setProperty("--loc", String(local));
      const introEl = document.getElementById(`${id}Intro`);
      if (introEl) introEl.style.opacity = String(1 - Math.min(1, q / 0.06));
      if (idx !== last) { last = idx; setActive(idx); }
    }
    raf = requestAnimationFrame(frame);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [id, N]);

  const p = items[active];
  return (
    <section id={id} className="ls-sec section-light">
      <div className="ls-stage" ref={stageRef}>
        <div className="pt-eyebrow track-sm ls-eyebrow">{eyebrow}</div>
        {intro && (
          <div className="ls-intro" id={`${id}Intro`}>
            <p className="sec-intro">{intro}</p>
          </div>
        )}
        <div className="ls-grid" key={active}>
          <div className="ls-left">
            <div className="ls-label track-sm">ЧТО СДЕЛАНО</div>
            <p className="ls-about">{p.about}</p>
            {p.tags && (
              <div className="ls-stack">
                {p.tags.map((tg) => <span className="ls-chip track-sm" key={tg}>{tg}</span>)}
              </div>
            )}
          </div>
          <div className="ls-right">
            <div className="ls-sub track-sm">{p.d}</div>
            <h2 className="ls-name" ref={nameRef}>{p.t}</h2>
          </div>
        </div>
        <div className="pt-counter track-sm ls-counter">
          <span>{p.n}</span><span className="pt-slash">/</span><span>{String(N).padStart(2, "0")}</span>
        </div>
      </div>
    </section>
  );
}
