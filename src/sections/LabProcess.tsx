import { useEffect, useRef, useState } from "react";

export type LabItem = { n: string; t: string; tagline: string; about: string; points: string[]; img: string };
export type Stat = { v: string; l: string };

const ICONS: React.ReactNode[] = [
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="6" cy="6" r="2.3" /><circle cx="18" cy="6" r="2.3" /><circle cx="12" cy="18" r="2.3" /><path d="M7.6 7.6 11 15.5M16.4 7.6 13 15.5M8 6h8" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" /><path d="M3 7l9 5 9-5M12 12v10" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M3 12h18" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" /></svg>,
];

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);

export default function LabProcess({
  id, eyebrow, title, lead, items, stats, contrib = "МОЙ ВКЛАД",
}: {
  id: string; eyebrow: string; title: React.ReactNode; lead: string;
  items: LabItem[]; stats: Stat[]; contrib?: string;
}) {
  const [active, setActive] = useState(0);
  const N = items.length;
  const hoverUntil = useRef(0);

  useEffect(() => {
    const sec = document.getElementById(id);
    if (!sec) return;
    let raf = 0, running = true, last = -1;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      if (performance.now() < hoverUntil.current) return;
      const vh = window.innerHeight;
      const range = sec.offsetHeight - vh;
      const q = range > 0 ? Math.max(0, Math.min(0.999, (window.scrollY - sec.offsetTop) / range)) : 0;
      const idx = Math.max(0, Math.min(N - 1, Math.floor(q * N)));
      if (idx !== last) { last = idx; setActive(idx); }
    };
    raf = requestAnimationFrame(frame);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [id, N]);

  const pick = (i: number) => { hoverUntil.current = performance.now() + 2500; setActive(i); };

  return (
    <section id={id} className="lp-sec section-light">
      <div className="lp-stage">
        <div className="lp-wrap">
          <span className="lp-eyebrow track-sm">{eyebrow}</span>
          <div className="lp-head">
            <h2 className="lp-title">{title}</h2>
            <p className="lp-lead">{lead}</p>
          </div>

          <div className="lp-line">
            <div className="lp-line-fill" style={{ width: `${(active / (N - 1)) * 100}%` }} />
            {items.map((_, i) => (
              <span key={i} className={`lp-node${i <= active ? " on" : ""}`} style={{ left: `${(i / (N - 1)) * 100}%` }} />
            ))}
          </div>

          <div className="lp-grid">
            {items.map((it, i) => (
              <article
                key={it.t}
                className={`lp-card ${i === active ? "on" : i < active ? "past" : "future"}`}
                onMouseEnter={() => pick(i)}
                onClick={() => pick(i)}
              >
                <span className="lp-corner tl" /><span className="lp-corner br" />
                <div className="lp-card-top">
                  <span className="lp-ico">{ICONS[i % ICONS.length]}</span>
                  <span className="lp-num track-sm">{it.n}</span>
                </div>

                {/* свёрнутая карточка — вертикальное имя */}
                <div className="lp-mini"><span className="lp-mini-name">{it.t}</span></div>

                {/* активная карточка — текст, под ним превью на всю ширину */}
                <div className="lp-detail">
                  <div className="lp-dtext">
                    <h3 className="lp-name">{it.t}</h3>
                    <p className="lp-tagline">{it.tagline}</p>
                    <p className="lp-desc">{it.about}</p>
                    <div className="lp-contrib-l track-sm">{contrib}</div>
                    <ul className="lp-points">
                      {it.points.map((p) => <li className="lp-point" key={p}>{CHECK}<span>{p}</span></li>)}
                    </ul>
                  </div>
                  <div className="lp-shot"><img src={it.img} alt={it.t} loading="lazy" /></div>
                </div>
              </article>
            ))}
          </div>

          <div className="lp-stats">
            {stats.map((s) => (
              <div className="lp-stat" key={s.l}>
                <div className="lp-stat-v">{s.v}</div>
                <div className="lp-stat-l track-sm">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
