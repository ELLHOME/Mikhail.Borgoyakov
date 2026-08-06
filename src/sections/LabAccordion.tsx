import { useState } from "react";

export type LabItem = {
  n: string; t: string; d: string; about: string; points: string[];
};

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// по одному лаконичному контурному значку на проект
const ICONS: React.ReactNode[] = [
  // globe / geo
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>,
  // network / platform
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="12" cy="18" r="2.4" /><path d="M7.6 7.6 11 15.5M16.4 7.6 13 15.5M8 6h8" /></svg>,
  // window / corporate site
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></svg>,
  // cube / 3d product
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" /><path d="M3 7l9 5 9-5M12 12v10" /></svg>,
  // scanner
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M3 12h18" /></svg>,
  // building
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" /></svg>,
];

export default function LabAccordion({
  id, eyebrow, title, lead, items,
}: { id: string; eyebrow: string; title: React.ReactNode; lead: string; items: LabItem[] }) {
  const [open, setOpen] = useState(0);
  const p = items[open] ?? items[0];

  return (
    <section id={id} className="lab-acc section-light">
      <div className="la-wrap">
        <span className="la-eyebrow track-sm">{eyebrow}</span>
        <div className="la-head">
          <h2 className="la-title">{title}</h2>
          <p className="la-lead">{lead}<span className="la-core track-sm">ИЗБРАННЫЕ РАБОТЫ</span></p>
        </div>

        <div className="la-grid">
          <div className="la-list">
            {items.map((it, i) => {
              const isOpen = i === open;
              return (
                <div
                  key={it.t}
                  className={`la-row${isOpen ? " open" : ""}`}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <div className="la-rowhead">
                    <span className="la-ico">{ICONS[i % ICONS.length]}</span>
                    <span className="la-num track-sm">{it.n}</span>
                    <span className="la-namebox">
                      <span className="la-name">{it.t}</span>
                      <span className="la-sub track-sm">{it.d}</span>
                    </span>
                    <span className="la-toggle" />
                  </div>
                  <div className="la-body">
                    <div className="la-bodyin">
                      <p className="la-desc">{it.about}</p>
                      <div className="la-checks">
                        {it.points.map((pt) => (
                          <span className="la-check" key={pt}>{CHECK}<span>{pt}</span></span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="la-panel" aria-hidden>
            <div className="la-grid-lines" />
            <span className="la-corner tl" /><span className="la-corner tr" />
            <span className="la-corner bl" /><span className="la-corner br" />
            <div className="la-panel-name">
              <div className="pn-t">{p.t}</div>
              <div className="pn-s track-sm">{p.d}</div>
            </div>
            <div className="la-panel-foot">ИЗБРАННЫЙ ПРОЕКТ</div>
          </aside>
        </div>
      </div>
    </section>
  );
}
