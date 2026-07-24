const links = [
  { href: "#top", label: "ГЛАВНАЯ", active: true },
  { href: "#about", label: "ОБО МНЕ" },
  { href: "#works", label: "РАБОТЫ" },
  { href: "#lab", label: "LAB" },
  { href: "#contact", label: "КОНТАКТЫ" },
];

export default function Nav() {
  return (
    <>
      <nav className="nav">
        <div className="brand">
          <div className="b-name track-sm">ELLHOME</div>
          <div className="b-sub track-sm">ELECTRONIC LIFE LAB</div>
        </div>
        <div className="nav-links">
          {links.map((l) => (
            <a key={l.href} href={l.href} className={l.active ? "active" : undefined}>{l.label}</a>
          ))}
        </div>
        <button className="nav-toggle" id="navToggle" aria-label="Меню"><span></span><span></span></button>
      </nav>

      <div className="nav-overlay" id="navOverlay">
        <button className="close" id="navClose" aria-label="Закрыть">✕</button>
        {links.map((l) => (
          <a key={l.href} href={l.href} className={l.active ? "active" : undefined}>{l.label}</a>
        ))}
      </div>
    </>
  );
}
