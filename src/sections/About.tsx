const BASE = import.meta.env.BASE_URL;
const chips = ["ДИЗАЙН", "КОД", "МОУШН", "3D", "ИИ", "БРЕНДИНГ"];

export default function About() {
  return (
    <section id="about" className="about-sec section-light">
      <div className="about-stage">
        <div className="about-inner">
          <div className="eyebrow track-sm">01 — ОБО МНЕ</div>
          <div className="about-grid">
            <div className="about-photo">
              <div className="ba-slider" id="aboutPhoto">
                <img className="ba-base" src={`${BASE}after.webp`} alt="Михаил" />
                <div className="ba-before"><img src={`${BASE}before.webp`} alt="Цифровой образ" /></div>
                <span className="ba-tag l">DIGITAL</span>
                <span className="ba-tag r">HUMAN</span>
                <div className="ba-divider"></div>
                <div className="ba-handle">
                  <svg viewBox="0 0 24 24"><path d="M9 7l-5 5 5 5V7zm6 0v10l5-5-5-5z" /></svg>
                </div>
              </div>
            </div>
            <div className="about-text">
              <p className="about-lead" id="abL">
                Привет, я Михаил.<br />Дизайнер и разработчик цифровых продуктов.<br />
                ELLHOME — моя лаборатория, где идея и технология тянутся навстречу друг другу.
              </p>
              <div className="about-body">
                <p id="abP1">
                  Создаю сайты и программное обеспечение, работаю с моушном и 3D — от первой идеи до готового
                  продукта. Мне интересно соединять технологии и визуальную форму так, чтобы они не просто
                  работали, а создавали впечатление.
                </p>
                <p id="abP2">
                  Каждый проект начинается с касания — момента, когда идея встречается с воплощением. Именно
                  это и есть ELLHOME.
                </p>
                <div className="about-tags" id="abT">
                  {chips.map((c) => <span key={c} className="chip">{c}</span>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
