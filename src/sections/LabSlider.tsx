import { useEffect, useRef, useState } from "react";
import type { LabItem, Stat } from "./LabProcess";

/**
 * Лента проектов: один кадр за раз, в край экрана, с постоянным движением.
 *
 * Слайды НЕ едут непрерывным полотном: прокрутка выбирает только номер проекта,
 * а кадр раскрывается разом из горизонтальной линии. Раньше кадр был привязан
 * к прокрутке напрямую, и почти всё время в рамке висели два разных сайта,
 * состыкованных швом.
 *
 * Листание привязано к прокрутке страницы, а не к перехвату колеса: исходный
 * компонент вешал wheel с preventDefault на window, и это заглушило бы скролл
 * всего сайта (вся страница — прокруточный нарратив на Lenis).
 */
export default function LabSlider({
  id, eyebrow, title, lead, items, stats, contrib = "МОЙ ВКЛАД",
}: {
  id: string; eyebrow: string; title: React.ReactNode; lead: string;
  items: LabItem[]; stats: Stat[]; contrib?: string;
}) {
  const N = items.length;
  const [active, setActive] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  // прокрутка выбирает проект
  useEffect(() => {
    const sec = document.getElementById(id);
    if (!sec) return;
    let raf = 0, last = -1;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const range = sec.offsetHeight - window.innerHeight;
      const q = range > 0
        ? Math.max(0, Math.min(0.999, (window.scrollY - sec.offsetTop) / range))
        : 0;
      const idx = Math.max(0, Math.min(N - 1, Math.floor(q * N)));
      if (idx !== last) { last = idx; setActive(idx); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id, N]);

  // наклон кадра за курсором — только там, где курсор есть,
  // и только если человек не просил убрать анимации
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (matchMedia("(hover: none)").matches) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, nx = 0, ny = 0;
    const onMove = (e: MouseEvent) => {
      const r = stage.getBoundingClientRect();
      nx = (e.clientX - r.left) / r.width - 0.5;
      ny = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const apply = () => {
      raf = 0;
      stage.style.setProperty("--ls-ry", (nx * 5).toFixed(2) + "deg");
      stage.style.setProperty("--ls-rx", (-ny * 3.2).toFixed(2) + "deg");
    };
    const onLeave = () => {
      stage.style.setProperty("--ls-ry", "0deg");
      stage.style.setProperty("--ls-rx", "0deg");
    };
    stage.addEventListener("mousemove", onMove);
    stage.addEventListener("mouseleave", onLeave);
    return () => {
      stage.removeEventListener("mousemove", onMove);
      stage.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const jump = (i: number) => {
    const sec = document.getElementById(id);
    if (!sec) return;
    const range = sec.offsetHeight - window.innerHeight;
    // середина отрезка, отведённого проекту, — чтобы не встать на границу
    window.scrollTo({ top: sec.offsetTop + ((i + 0.5) / N) * range, behavior: "smooth" });
  };

  const it = items[active];

  return (
    <section id={id} className="ls-sec section-light" style={{ height: `${N * 72}vh` }}>
      <div className="ls-stage" ref={stageRef}>
        <div className="ls-left">
          <span className="ls-eyebrow track-sm">{eyebrow}</span>

          {/* заголовок секции говорит своё на первом проекте и уходит,
              освобождая воздух под крупное имя */}
          <div className={`ls-head${active === 0 ? "" : " off"}`}>
            <h2 className="ls-title">{title}</h2>
            <p className="ls-lead">{lead}</p>
          </div>

          <div className="ls-caption" key={it.t}>
            <span className="ls-num track-sm">{it.n} / {String(N).padStart(2, "0")}</span>
            <h3 className="ls-name">{it.t}</h3>
            <p className="ls-tagline">{it.tagline}</p>
            <div className="ls-contrib track-sm">{contrib}</div>
            <ul className="ls-points">
              {it.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>

          {/* единственный навигатор: миникарта и вертикальный прогресс
              говорили одно и то же, осталась одна строка точек */}
          <nav className="ls-nav" aria-label={typeof title === "string" ? title : "projects"}>
            {items.map((p, i) => (
              <button key={p.t} className={`ls-dot${i === active ? " on" : ""}`}
                      onClick={() => jump(i)} aria-label={p.t}
                      aria-current={i === active ? "true" : undefined} />
            ))}
          </nav>

          <div className="ls-stats">
            {stats.map((s) => (
              <div className="ls-stat" key={s.l}>
                <span className="ls-stat-v">{s.v}</span>
                <span className="ls-stat-l track-sm">{s.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Кадр уходит в правый край экрана — без рамки и тени, как полосные
            картинки в соседних секциях. Высоту задаёт сама картинка:
            aspect-ratio поддержан не везде, и там коробка схлопывалась. */}
        <div className="ls-frame">
          <div className="ls-slide" key={active}>
            <img src={it.img} alt={it.t} loading={active < 2 ? "eager" : "lazy"} />
          </div>
        </div>
      </div>
    </section>
  );
}
