import { useEffect } from "react";

/**
 * Set document title + description + Open Graph tags for public market pages.
 */
export function usePublicMeta(title: string, description: string) {
  useEffect(() => {
    const brand = "Cleva Market";
    const fullTitle = title === brand || title.endsWith(` · ${brand}`) ? title : `${title} · ${brand}`;
    document.title = fullTitle;

    const ensureMeta = (attr: "name" | "property", key: string, content: string) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    ensureMeta("name", "description", description);
    ensureMeta("property", "og:title", fullTitle);
    ensureMeta("property", "og:description", description);
    ensureMeta("property", "og:type", "website");
    ensureMeta("name", "twitter:card", "summary_large_image");
    ensureMeta("name", "twitter:title", fullTitle);
    ensureMeta("name", "twitter:description", description);
    ensureMeta("name", "theme-color", "#f4ecdf");

    return () => {
      document.title = "Clevafarm";
      ensureMeta("name", "theme-color", "#0F8F78");
    };
  }, [title, description]);
}
