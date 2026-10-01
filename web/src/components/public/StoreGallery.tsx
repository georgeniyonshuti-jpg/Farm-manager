import { useState } from "react";

type Item = { url: string; caption?: string | null; purpose?: string };

export function StoreGallery({
  items,
  alt,
  fallback,
}: {
  items: Item[];
  alt: string;
  fallback?: { district?: string | null; birds?: number; label?: string };
}) {
  const photos = items.filter((x) => x.url);
  const [active, setActive] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="store-gallery-hero flex aspect-[4/3] flex-col justify-end bg-[#2a1c14] p-6 text-[var(--store-cream)] sm:aspect-[16/10]">
        <p className="store-kicker">{fallback?.district || "Rwanda"}</p>
        {fallback?.birds != null ? (
          <p className="store-display text-6xl">{fallback.birds.toLocaleString()}</p>
        ) : null}
        <p className="mt-1 text-sm opacity-70">{fallback?.label || alt}</p>
      </div>
    );
  }

  const current = photos[Math.min(active, photos.length - 1)];
  return (
    <div className="space-y-3">
      <div className="store-gallery-hero overflow-hidden">
        <img src={current.url} alt={current.caption || alt} className="aspect-[4/3] w-full object-cover sm:aspect-[16/10]" />
      </div>
      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={p.url + i}
              type="button"
              onClick={() => setActive(i)}
              className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border ${
                i === active ? "border-[var(--store-ember)]" : "border-[var(--store-line)]"
              }`}
            >
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
