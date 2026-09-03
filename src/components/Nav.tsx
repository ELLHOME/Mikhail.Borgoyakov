import { useLang, content, type Lang } from "../i18n";

function LangSwitch() {
  const { lang, setLang } = useLang();
  const opts: Lang[] = ["ru", "en"];
  return (
    <div className="lang-switch track-sm" role="group" aria-label="Language">
      {opts.map((o, i) => (
        <span key={o} style={{ display: "contents" }}>
          {i > 0 && <span className="ls-sep">/</span>}
          <button
            type="button"
            className={lang === o ? "on" : undefined}
            aria-pressed={lang === o}
            onClick={() => setLang(o)}
          >
            {o.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}

export default function Nav() {
  const { lang } = useLang();
  const t = content[lang].nav;

  const links = [
    { href: "#top", label: t.home, active: true },
    { href: "#about", label: t.about },
    { href: "#works", label: t.works },
    { href: "#lab", label: t.lab },
    { href: "#contact", label: t.contact },
  ];

  return (
    <>
      <nav className="nav">
        <div className="brand">
          <div className="b-name track-sm">ELLHOME</div>
          <div className="b-sub track-sm">ELECTRONIC LIFE LAB</div>
        </div>
        <div className="nav-right">
          <div className="nav-links">
            {links.map((l) => (
              <a key={l.href} href={l.href} className={l.active ? "active" : undefined}>{l.label}</a>
            ))}
          </div>
          <LangSwitch />
          <button className="nav-toggle" id="navToggle" aria-label={t.menu}><span></span><span></span></button>
        </div>
      </nav>

      <div className="nav-overlay" id="navOverlay">
        <button className="close" id="navClose" aria-label={t.close}>✕</button>
        {links.map((l) => (
          <a key={l.href} href={l.href} className={l.active ? "active" : undefined}>{l.label}</a>
        ))}
      </div>
    </>
  );
}
