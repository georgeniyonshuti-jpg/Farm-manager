import { useState } from "react";

type Item = { url: string; caption?: string | null; purpose?: string };

export function MarketGallery({ items, alt }: { items: Item[]; alt: string }) {
  const photos = items.filter((x) => x.url);
  const [active, setActive] = useState(0);
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-lg bg-[var(--surface-subtle)] type-caption text-[var(--text-muted)]">
        Photos after verification
      </div>
    );
  }
  const current = photos[Math.min(active, photos.length - 1)];
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg bg-[var(--surface-subtle)]">
        <img src={current.url} alt={current.caption || alt} className="aspect-[16/9] w-full object-cover" />
      </div>
      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={p.url + i}
              type="button"
              onClick={() => setActive(i)}
              className={`h-16 w-20 shrink-0 overflow-hidden rounded-control border ${
                i === active ? "border-[var(--primary-color)]" : "border-[var(--border-color)]"
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
