export default function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero-stage">
        <canvas className="hand-canvas" id="handCanvas"></canvas>
        <div className="hero-logo" id="heroLogo">
          <div className="l-name">ELLHOME</div>
          <div className="l-sub">ELECTRONIC LIFE LAB</div>
          <div className="l-tag">A home for digital ideas.</div>
        </div>
        <div className="scroll-ind" id="scrollInd">
          <span>SCROLL</span>
          <div className="bar"></div>
        </div>
      </div>
    </header>
  );
}
