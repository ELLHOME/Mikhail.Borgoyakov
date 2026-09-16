import { useEffect } from "react";
import Lenis from "lenis";
import Nav from "./components/Nav";
import Hero from "./sections/Hero";
import About from "./sections/About";
import Works from "./sections/Works";
import Lab from "./sections/Lab";
import Contact from "./sections/Contact";
import Footer from "./components/Footer";
import ChatWidget from "./components/ChatWidget";
import { initSiteEffects } from "./hooks/useSiteEffects";
import { track } from "./lib/track";

export default function App() {
  useEffect(() => {
    // smooth momentum scroll (floema-style)
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true });
    let rafId = 0;
    const raf = (t: number) => { lenis.raf(t); rafId = requestAnimationFrame(raf); };
    rafId = requestAnimationFrame(raf);
    // anchor links -> smooth scroll via lenis
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.getAttribute("href")!;
      if (id.length > 1) { const el = document.querySelector(id); if (el) { e.preventDefault(); lenis.scrollTo(el as HTMLElement); } }
    };
    document.addEventListener("click", onClick);

    const cleanup = initSiteEffects();

    // Счётчик: заход и то, докуда человек реально доскроллил.
    track("page_view", {
      lang: document.documentElement.lang || "ru",
      w: window.innerWidth,
      ref: document.referrer ? new URL(document.referrer).hostname : "",
    }, "page_view");

    // Секция считается просмотренной, когда закрыла половину экрана.
    // Порог в долях самой секции тут не годится: блоки высотой в пять
    // экранов никогда не займут треть себя — и не попали бы в статистику.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.target.id) continue;
        if (e.isIntersecting && e.intersectionRect.height > window.innerHeight * 0.5) {
          track("section_view", { id: e.target.id }, "sec:" + e.target.id);
        }
      }
    }, { threshold: [0, 0.05, 0.25, 0.5, 0.75, 1] });
    document.querySelectorAll("section[id], header[id]").forEach((el) => io.observe(el));

    // Переходы по контактам — последний шаг перед письмом
    const onContact = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (href.startsWith("mailto:")) track("contact_click", { kind: "email" });
      else if (href.includes("t.me/")) track("contact_click", { kind: "telegram" });
      else if (href.includes("wa.me/")) track("contact_click", { kind: "whatsapp" });
    };
    document.addEventListener("click", onContact);

    return () => {
      cancelAnimationFrame(rafId); lenis.destroy();
      document.removeEventListener("click", onClick);
      document.removeEventListener("click", onContact);
      io.disconnect();
      cleanup();
    };
  }, []);

  return (
    <>
      <Nav />
      <Hero />
      <About />
      <Works />
      <Lab />
      <Contact />
      <Footer />
      <ChatWidget />
    </>
  );
}
