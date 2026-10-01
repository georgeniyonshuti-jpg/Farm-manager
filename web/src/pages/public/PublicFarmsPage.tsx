import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { fetchPublicFarms, type PublicFarmCard } from "../../api/publicMarket.api";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

type OutletCtx = { locale: StoreLocale };

export function PublicFarmsPage() {
  const { locale } = useOutletContext<OutletCtx>();
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const [items, setItems] = useState<PublicFarmCard[]>([]);
  const [loading, setLoading] = useState(true);
  usePublicMeta(t("farmsTitle"), t("farmsEmpty"));

  useEffect(() => {
    void fetchPublicFarms()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <section className="store-hero" id="store-hero-edge">
        <div className="store-wrap relative z-10 space-y-4 py-14">
          <h1 className="store-display max-w-4xl">{t("farmsTitle")}</h1>
        </div>
      </section>
      <div className="store-wrap py-10">
        {loading ? <div className="store-card h-48 animate-pulse bg-[#e8ddd0]" /> : null}
        {!loading && items.length === 0 ? (
          <div className="space-y-3">
            <p className="font-[var(--font-display)] text-3xl font-extrabold">{t("farmsEmpty")}</p>
            <p className="text-[var(--store-muted)]">{t("farmsEmptyHint")}</p>
            <p>
              {t("forFarmsLine")}{" "}
              <Link to="/market?sell=1" className="store-text-link">
                {t("listBirds")}
              </Link>
            </p>
          </div>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((farm) => (
            <Link
              key={farm.slug}
              to={`/market/farm/${encodeURIComponent(farm.slug)}`}
              className="store-card store-lot no-underline"
            >
              <div className="store-lot-media aspect-[16/10] overflow-hidden bg-[#2a1c14]">
                {farm.coverUrl ? <img src={farm.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="p-5">
                <p className="font-[var(--font-display)] text-xl font-extrabold">{farm.displayName}</p>
                <p className="mt-1 text-sm text-[var(--store-muted)]">{farm.locationLabel || farm.district}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
