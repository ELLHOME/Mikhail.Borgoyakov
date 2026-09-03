import { useLang, content } from "../i18n";

export default function Contact() {
  const { lang } = useLang();
  const t = content[lang].contact;
  return (
    <section id="contact" className="contact">
      <div className="eyebrow track-sm reveal">{t.eyebrow}</div>
      <h2 className="sec-title reveal" style={{ fontWeight: 200 }}>{t.title}</h2>
      <a className="c-mail" href="mailto:ellhome@yandex.ru">ellhome@yandex.ru</a>
      <div className="c-links reveal">
        <a href="https://t.me/M_B_lab" target="_blank" rel="noopener noreferrer">TELEGRAM</a>
        <a href="https://github.com/ellhome" target="_blank" rel="noopener noreferrer">GITHUB</a>
      </div>
    </section>
  );
}
