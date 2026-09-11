import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { LabItem, Stat } from "./LabProcess";

const LaptopScene = lazy(() => import("./LabLaptopScene"));

/**
 * Предохранитель вокруг ленивой сцены.
 * Без него сорвавшаяся загрузка куска (устаревший кеш после деплоя, плохая
 * связь) роняла всё дерево React — белой становилась вся страница, а не одна
 * секция. Теперь в этом случае показывается обычный кадр.
 */
class SceneBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("Lab: сцена не загрузилась", err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function LabLaptop({
  id, eyebrow, title, lead, items, stats, contrib = "МОЙ ВКЛАД",
}: {
  id: string; eyebrow: string; title: React.ReactNode; lead: string;
  items: LabItem[]; stats: Stat[]; contrib?: string;
}) {
  const N = items.length;
  const [active, setActive] = useState(0);
  const [near, setNear] = useState(false);          // сцену монтируем только рядом с экраном
  const [flat, setFlat] = useState(false);          // запасной путь без 3D
  const prog = useRef(0);

  useEffect(() => {
    setFlat(
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !document.createElement("canvas").getContext("webgl2")
    );
  }, []);

  useEffect(() => {
    const sec = document.getElementById(id);
    if (!sec) return;
    const io = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { rootMargin: "60% 0px" }
    );
    io.observe(sec);

    let raf = 0, last = -1;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const range = sec.offsetHeight - window.innerHeight;
      const q = range > 0
        ? Math.max(0, Math.min(0.999, (window.scrollY - sec.offsetTop) / range))
        : 0;
      prog.current = q * N;
      const idx = Math.min(N - 1, Math.floor(prog.current));
      if (idx !== last) { last = idx; setActive(idx); }
    };
    raf = requestAnimationFrame(frame);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [id, N]);

  const jump = (i: number) => {
    const sec = document.getElementById(id);
    if (!sec) return;
    const range = sec.offsetHeight - window.innerHeight;
    // середина «открытой» фазы проекта
    window.scrollTo({ top: sec.offsetTop + ((i + 0.5) / N) * range, behavior: "smooth" });
  };

  const it = items[active];
  const imgs = useMemo(() => items.map((x) => x.img), [items]);
  const kinds = useMemo(() => items.map((x) => x.kind ?? "web"), [items]);
  const vids = useMemo(() => items.map((x) => x.video), [items]);
  const keys = useMemo(() => items.map((x) => x.keyOn), [items]);

  return (
    <section id={id} className="ll-sec section-light" style={{ height: `${N * 100}vh` }}>
      <div className="ll-stage">
        <div className="ll-scene">
          {flat ? (
            <img className="ll-flat" src={it.img} alt={it.t} />
          ) : near ? (
            <SceneBoundary fallback={<img className="ll-flat" src={it.img} alt={it.t} />}>
              <Suspense fallback={null}>
                <LaptopScene imgs={imgs} kinds={kinds} vids={vids} keys={keys} getP={() => prog.current} />
              </Suspense>
            </SceneBoundary>
          ) : null}
        </div>

        <div className="ll-ui">
          <span className="ll-eyebrow track-sm">{eyebrow}</span>
          <div className={`ll-head${active === 0 ? "" : " off"}`}>
            <h2 className="ll-title">{title}</h2>
            <p className="ll-lead">{lead}</p>
          </div>

          <div className="ll-caption" key={it.t}>
            <span className="ll-num track-sm">{it.n} / {String(N).padStart(2, "0")}</span>
            <h3 className={`ll-name${it.t.length > 9 ? " long" : ""}`}>{it.t}</h3>
            <p className="ll-tagline">{it.tagline}</p>
            <div className="ll-contrib track-sm">{contrib}</div>
            <ul className="ll-points">{it.points.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>

          <nav className="ll-nav">
            {items.map((p, i) => (
              <button key={p.t} className={`ll-dot${i === active ? " on" : ""}`}
                      onClick={() => jump(i)} aria-label={p.t} />
            ))}
          </nav>

          <div className="ll-stats">
            {stats.map((s) => (
              <div className="ll-stat" key={s.l}>
                <span className="ll-stat-v">{s.v}</span>
                <span className="ll-stat-l track-sm">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
