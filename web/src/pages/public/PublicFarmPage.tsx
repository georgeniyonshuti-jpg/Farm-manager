import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { fetchPublicFarm, type PublicFarmCard, type PublicLot } from "../../api/publicMarket.api";
import { StoreLotCard } from "../../components/public/StoreLotCard";
import { StoreGallery } from "../../components/public/StoreGallery";
import { StoreRequestSheet } from "../../components/public/StoreRequestSheet";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { useStickyAfterHero } from "../../hooks/useStickyAfterHero";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

type OutletCtx = { locale: StoreLocale };

export function PublicFarmPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { locale } = useOutletContext<OutletCtx>();
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const [farm, setFarm] = useState<PublicFarmCard | null>(null);
  const [lots, setLots] = useState<PublicLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  usePublicMeta(farm ? farm.displayName : "Farm", farm?.story || storeT("en", "farmsTitle"));
  const showSticky = useStickyAfterHero(Boolean(farm));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPublicFarm(slug)
      .then((r) => {
        if (cancelled) return;
        setFarm(r.farm);
        setLots(r.lots || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("farmMissing"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="store-wrap py-16">
        <div className="store-card h-80 animate-pulse bg-[#e8ddd0]" />
      </div>
    );
  }

  if (error || !farm) {
    return (
      <div className="store-wrap space-y-4 py-16">
        <p className="font-[var(--font-display)] text-3xl font-extrabold">{t("farmMissing")}</p>
        <Link to="/market" className="store-btn store-btn-ghost">
          {t("back")}
        </Link>
      </div>
    );
  }

  const gallery = farm.media?.length
    ? farm.media
    : farm.coverUrl
      ? [{ url: farm.coverUrl, purpose: "cover", caption: null }]
      : [];

  return (
    <div className="pb-28 lg:pb-16">
      <div className="store-wrap space-y-8 py-8 lg:py-12">
        <Link to="/market" className="text-sm font-bold text-[var(--store-ember)]">
          ← {t("back")}
        </Link>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <StoreGallery items={gallery} alt={farm.displayName} fallback={{ district: farm.district, label: farm.displayName }} />
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--store-moss)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                {t("verified")}
              </span>
              {farm.slaughterAvailable ? <span className="store-pill">{t("slaughter")}</span> : null}
              {farm.deliveryAvailable ? <span className="store-pill">{t("delivery")}</span> : null}
            </div>
            <h1 className="store-display text-[2.6rem] sm:text-5xl">{farm.displayName}</h1>
            <p className="text-[var(--store-muted)]">{farm.locationLabel || farm.district || "Rwanda"}</p>
            {farm.story ? <p className="leading-relaxed text-[var(--store-ink-soft)]">{farm.story}</p> : null}
            {farm.specialties?.length ? (
              <div className="flex flex-wrap gap-2">
                {farm.specialties.map((s) => (
                  <span key={s} className="store-pill">
                    {s}
                  </span>
                ))}
              </div>
            ) : null}
            {farm.contactPhone ? (
              <a href={`tel:${farm.contactPhone}`} className="store-btn store-btn-ghost inline-flex">
                {t("callFarm")} · {farm.contactPhone}
              </a>
            ) : null}
            <button type="button" className="store-btn store-btn-ember hidden lg:inline-flex" onClick={() => setRequestOpen(true)}>
              {t("request")}
            </button>
          </div>
        </div>

        <section className="space-y-4">
          <h2 className="font-[var(--font-display)] text-2xl font-extrabold">{t("currentLots")}</h2>
          {lots.length === 0 ? (
            <p className="text-[var(--store-muted)]">{t("emptyTitle")}</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {lots.map((lot) => (
                <StoreLotCard
                  key={lot.publicRef}
                  lot={lot}
                  locale={locale}
                  to={`/market/lot/${encodeURIComponent(lot.publicRef)}`}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {showSticky ? (
        <div className="store-sticky-bar lg:hidden">
          <button type="button" className="store-btn store-btn-ember w-full" onClick={() => setRequestOpen(true)}>
            {t("request")}
          </button>
        </div>
      ) : null}

      <StoreRequestSheet
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        locale={locale}
        district={farm.district || undefined}
      />
    </div>
  );
}
