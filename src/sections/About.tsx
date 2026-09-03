import { useLang, content } from "../i18n";

const BASE = import.meta.env.BASE_URL;

export default function About() {
  const { lang } = useLang();
  const t = content[lang].about;

  return (
    <section id="about" className="about-sec section-light">
      <div className="about-stage">
        <div className="about-inner">
          <div className="eyebrow track-sm">{t.eyebrow}</div>
          <div className="about-grid">
            <div className="about-photo">
              <div className="ba-slider" id="aboutPhoto">
                <img className="ba-base" src={`${BASE}after.webp`} alt={t.altHuman} />
                <div className="ba-before"><img src={`${BASE}before.webp`} alt={t.altDigital} /></div>
                <span className="ba-tag l">DIGITAL</span>
                <span className="ba-tag r">HUMAN</span>
                <div className="ba-divider"></div>
                <div className="ba-handle">
                  <svg viewBox="0 0 24 24"><path d="M9 7l-5 5 5 5V7zm6 0v10l5-5-5-5z" /></svg>
                </div>
              </div>
            </div>
            <div className="about-text">
              <p className="about-lead" id="abL">{t.lead}</p>
              <div className="about-body">
                <p id="abP1">{t.p1}</p>
                <p id="abP2">{t.p2}</p>
                <div className="about-tags" id="abT">
                  {t.chips.map((c) => <span key={c} className="chip">{c}</span>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
