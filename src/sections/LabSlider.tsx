import { useEffect, useRef, useState } from "react";
import type { LabItem, Stat } from "./LabProcess";

/**
 * Лента проектов: крупный кадр на весь экран, справа миникарта с превью и метаданными.
 *
 * Отличие от исходного компонента с 21st.dev — листание привязано к прокрутке страницы,
 * а не к перехвату колеса. Оригинал вешал wheel с preventDefault на window, и это
 * заглушило бы скролл всего сайта (у нас вся страница — прокруточный нарратив на Lenis).
 *
 * Позиции пишем напрямую в style из requestAnimationFrame, без setState на каждый кадр:
 * React перерисовывается только когда меняется активный проект.
 */
export default function LabSlider({
  id, eyebrow, title, lead, items, stats, contrib = "МОЙ ВКЛАД",
}: {
  id: string; eyebrow: string; title: React.ReactNode; lead: string;
  items: LabItem[]; stats: Stat[]; contrib?: string;
}) {
  const N = items.length;
  const [active, setActive] = useState(0);

  const slides = useRef<(HTMLDivElement | null)[]>([]);
  const shots = useRef<(HTMLImageElement | null)[]>([]);
  const minis = useRef<HTMLDivElement>(null);
  const infos = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sec = document.getElementById(id);
    if (!sec) return;
    const slow = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0, lastIdx = -1;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const range = sec.offsetHeight - window.innerHeight;
      const q = range > 0
        ? Math.max(0, Math.min(1, (window.scrollY - sec.offsetTop) / range))
        : 0;
      const p = q * (N - 1);                       // дробная позиция в ленте

      for (let i = 0; i < N; i++) {
        const d = i - p;                           // -1 = ушёл вверх, +1 = ждёт снизу
        const el = slides.current[i];
        if (!el) continue;
        const near = Math.abs(d) < 1.15;
        el.style.visibility = near ? "visible" : "hidden";
        if (!near) continue;
        // без прозрачности: это не кроссфейд, а листание сплошных панелей.
        // Полупрозрачные соседи просвечивали друг через друга и мазали кадр.
        el.style.transform = `translate3d(0,${d * 100}%,0)`;
        const img = shots.current[i];
        // кадр едет медленнее слайда — тот самый параллакс
        if (img) img.style.transform = slow ? "none" : `translate3d(0,${d * -14}%,0) scale(1.18)`;
      }

      const step = minis.current?.firstElementChild?.clientHeight || 0;
      if (minis.current) minis.current.style.transform = `translate3d(0,${-p * step}px,0)`;
      if (infos.current) infos.current.style.transform = `translate3d(0,${-p * step}px,0)`;
      if (fill.current) fill.current.style.height = `${(p / (N - 1)) * 100}%`;

      const idx = Math.round(p);
      if (idx !== lastIdx) { lastIdx = idx; setActive(idx); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id, N]);

  const jump = (i: number) => {
    const sec = document.getElementById(id);
    if (!sec) return;
    const range = sec.offsetHeight - window.innerHeight;
    window.scrollTo({ top: sec.offsetTop + (i / (N - 1)) * range, behavior: "smooth" });
  };

  return (
    <section id={id} className="ls-sec" style={{ height: `${N * 85}vh` }}>
      {/* Сцена — сетка в три колонки: текст, кадр, миникарта с прогрессом.
          Раньше всё лежало абсолютом и колонки наезжали друг на друга при
          некоторых ширинах; сетка делает это невозможным. */}
      <div className="ls-stage">
        <div className="ls-left">
          <div className="ls-head">
            <span className="ls-eyebrow track-sm">{eyebrow}</span>
            <h2 className="ls-title">{title}</h2>
            <p className="ls-lead">{lead}</p>
          </div>

          <div className="ls-caption" key={items[active].t}>
            <span className="ls-num track-sm">{items[active].n} / {String(N).padStart(2, "0")}</span>
            <h3 className="ls-name">{items[active].t}</h3>
            <p className="ls-tagline">{items[active].tagline}</p>
            <div className="ls-contrib track-sm">{contrib}</div>
            <ul className="ls-points">
              {items[active].points.map((p) => <li key={p}>{p}</li>)}
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

        {/* кадр проекта. Полноэкранная подача тут не годится: превью —
            светлые скриншоты сайтов, и затемнение под белый текст поверх
            превращало бы их в серую муть. */}
        <div className="ls-frame">
          {items.map((it, i) => (
            <div key={it.t} className="ls-slide" ref={(el) => { slides.current[i] = el; }}>
              <img src={it.img} alt={it.t} loading={i < 2 ? "eager" : "lazy"}
                   ref={(el) => { shots.current[i] = el; }} />
            </div>
          ))}
        </div>

        <div className="ls-side">
          <div className="ls-map" aria-hidden="true">
            <div className="ls-map-win">
              <div className="ls-map-strip" ref={minis}>
                {items.map((it, i) => (
                  <div className={`ls-map-item${i === active ? " on" : ""}`} key={it.t}>
                    <img src={it.img} alt="" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ls-rail">
            <span className="ls-rail-fill" ref={fill} />
            {items.map((it, i) => (
              <button key={it.t} className={`ls-dot${i === active ? " on" : ""}`}
                      style={{ top: `${(i / (N - 1)) * 100}%` }}
                      onClick={() => jump(i)} aria-label={it.t} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
