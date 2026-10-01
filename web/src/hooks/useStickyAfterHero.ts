import { useEffect, useState } from "react";

/** Sticky request bar only after the hero (or first screen) has left the viewport. */
export function useStickyAfterHero(enabled: boolean, heroId = "store-hero-edge") {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setShow(false);
      return;
    }

    const el = document.getElementById(heroId);
    if (!el) {
      const onScroll = () => setShow(window.scrollY > 240);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }

    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, heroId]);

  return show;
}
