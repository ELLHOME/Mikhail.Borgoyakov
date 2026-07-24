import { useEffect } from "react";
import Lenis from "lenis";
import Nav from "./components/Nav";
import Hero from "./sections/Hero";
import About from "./sections/About";
import Works from "./sections/Works";
import Lab from "./sections/Lab";
import Contact from "./sections/Contact";
import Footer from "./components/Footer";
import { initSiteEffects } from "./hooks/useSiteEffects";

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
    return () => { cancelAnimationFrame(rafId); lenis.destroy(); document.removeEventListener("click", onClick); cleanup(); };
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
    </>
  );
}
