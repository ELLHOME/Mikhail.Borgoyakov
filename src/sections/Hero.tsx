import { useLang, content } from "../i18n";

export default function Hero() {
  const { lang } = useLang();
  const t = content[lang].hero;
  return (
    <header className="hero" id="top">
      <div className="hero-stage">
        <canvas className="hand-canvas" id="handCanvas"></canvas>
        <div className="hero-logo" id="heroLogo">
          <div className="l-name">ELLHOME</div>
          <div className="l-sub">ELECTRONIC LIFE LAB</div>
          <div className="l-tag">{t.tag}</div>
        </div>
        <div className="scroll-ind" id="scrollInd">
          <span>SCROLL</span>
          <div className="bar"></div>
        </div>
      </div>
    </header>
  );
}
