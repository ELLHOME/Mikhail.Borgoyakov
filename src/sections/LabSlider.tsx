import { useEffect, useRef, useState } from "react";
import type { LabItem, Stat } from "./LabProcess";

/**
 * Лента проектов: один кадр за раз, крупно, плюс миникарта.
 *
 * Слайды НЕ едут непрерывным полотном. Раньше кадр был привязан к прокрутке
 * напрямую, и почти всё время в рамке висели два разных сайта, состыкованных
 * швом. Теперь прокрутка выбирает только номер проекта, а сам кадр появляется
 * разом — раскрывается из горизонтальной линии. Промежуточных состояний нет.
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
      {/* Сетка в три колонки: текст, кадр, миникарта с прогрессом.
          Абсолютное позиционирование давало наезды колонок на части ширин. */}
      <div className="ls-stage">
        <div className="ls-left">
          <div className="ls-head">
            <span className="ls-eyebrow track-sm">{eyebrow}</span>
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

          <div className="ls-stats">
            {stats.map((s) => (
              <div className="ls-stat" key={s.l}>
                <span className="ls-stat-v">{s.v}</span>
                <span className="ls-stat-l track-sm">{s.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Соотношение рамки равно соотношению самих превью (1680×1225),
            поэтому кадр ложится целиком: ничего не режется и полей нет. */}
        <div className="ls-frame">
          <div className="ls-slide" key={active}>
            <img src={it.img} alt={it.t} loading={active < 2 ? "eager" : "lazy"} />
          </div>
        </div>

        <div className="ls-side">
          <div className="ls-map" aria-hidden="true">
            <div className="ls-map-win">
              <div className="ls-map-strip" style={{ transform: `translateY(${-active * 90}px)` }}>
                {items.map((p, i) => (
                  <div className={`ls-map-item${i === active ? " on" : ""}`} key={p.t}>
                    <img src={p.img} alt="" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ls-rail">
            <span className="ls-rail-fill" style={{ height: `${(active / (N - 1)) * 100}%` }} />
            {items.map((p, i) => (
              <button key={p.t} className={`ls-dot${i === active ? " on" : ""}`}
                      style={{ top: `${(i / (N - 1)) * 100}%` }}
                      onClick={() => jump(i)} aria-label={p.t} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
